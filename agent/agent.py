import asyncio
import code
import re
import os
import json
import aiohttp
import logging
import datetime
import pymongo
from typing import AsyncIterable
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import JobContext, Agent, AgentSession, AgentServer, llm, tokenize
from livekit.plugins import silero, groq, deepgram, elevenlabs
from groq import Groq
from database import db as local_db
from livekit.agents.llm import ChatContext, ChatMessage, ChatRole

load_dotenv()
logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO)
# mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
# db = mongo_client["interview-platform"]
# sessions_collection = db["sessions"]    
# CURRENT_ROOM = None
# Global reference to the current LiveKit room for log-based forwarding
CURRENT_ROOM = None


class UserTranscriptLogHandler(logging.Handler):
    """Capture structured 'received user transcript' logs emitted by the SDK
    and forward the transcript to the LiveKit room when possible.
    """
    def __init__(self):
        super().__init__()
        self.seen = set()

    def emit(self, record: logging.LogRecord):
        try:
            data = record.__dict__
            # Many livekit logs include a 'user_transcript' key in extra
            text = data.get('user_transcript')
            if not text:
                # fallback: try to parse JSON-like message
                msg = str(record.getMessage())
                # quick guard
                if 'user_transcript' in msg:
                    # naive extraction, skip for brevity
                    return
                return

            text = text.strip()
            if not text or text in self.seen:
                return
            self.seen.add(text)

            # schedule async broadcast into the event loop
            loop = None
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                pass

            async def _broadcast():
                if CURRENT_ROOM is None:
                    print('⚠️ [LOG_FORWARD] No CURRENT_ROOM set, skipping')
                    return
                payload = json.dumps({
                    'type': 'transcript',
                    'role': 'user',
                    'content': text
                })
                try:
                    await CURRENT_ROOM.local_participant.publish_data(payload.encode('utf-8'), reliable=True)
                    print('✅ [LOG_FORWARDED] forwarded user transcript from SDK log')
                except Exception as e:
                    print(f'❌ [LOG_FORWARD_FAILED] {e}')

            if loop and loop.is_running():
                loop.call_soon_threadsafe(lambda: asyncio.create_task(_broadcast()))
            else:
                # try running it synchronously in a new loop as a last resort
                try:
                    asyncio.run(_broadcast())
                except Exception:
                    pass
        except Exception:
            pass


# Attach the handler to the livekit.agents logger
logging.getLogger('livekit.agents').addHandler(UserTranscriptLogHandler())

class InterviewAssistant(Agent):
    def __init__(self, question_obj, room=None, session_id=None):
        self._room = room
        self.session_id = session_id
        self._end_signal_event = asyncio.Event()
        self.current_code = ""

        # Extract details from the object fetched from local_db
        if isinstance(question_obj, dict):
            title = question_obj.get('title', 'Problem')
            desc = question_obj.get('description', 'No description provided.')
            inp = question_obj.get('exampleInput', 'N/A')
            out = question_obj.get('exampleOutput', 'N/A')
        else:
            title = str(question_obj)
            desc = inp = out = ""
        super().__init__(
            instructions=f"""# Role
                You are Chris, a professional Technical Interviewer. You are conducting a structured coding interview.
                
                # The Problem to Discuss
                Title: {title}
                Description: {desc}
                Example Input: {inp}
                Example Output: {out}

                # Interview Flow (Follow Strictly)
                1. **Problem Explanation**: Explain the problem "{desc}" in detail. Provide a clear example with input and expected output. Ask if the candidate understands.
                2. **Brute Force Discussion**: Ask the candidate to describe a brute force approach first. Discuss their logic, time complexity, and space complexity. Ask "What can be done better?" to nudge them.
                3. **Optimal Solution**: Once brute force is clear, discuss the optimal approach. Ask why this method is better and discuss the new complexities.
                4. **Coding Phase**: Only after the logic is fully discussed, invite the candidate to start coding in the editor.

                # IMPORTANT: ENDING THE INTERVIEW (MANDATORY)
                - When the candidate confirms they want to end the interview, you MUST conclude the interview.
                - To conclude, say a brief warm one-sentence goodbye and then append the exact token [[END_INTERVIEW]] at the very end of your response.
                - THIS IS MANDATORY: include the token exactly as shown (no extra characters).

                # Context
                Problem assigned: {title}

                # How to handle the Code Editor
                - You will receive "CANDIDATE CODE UPDATE" messages in your context history.
                - **Rule**: Whenever you see a new code block, analyze it silently.
                - **Rule**: Only speak if the candidate asks a question, or if they have finished a significant logic block and seem stuck.
                - **Rule**: Do not comment on every character.
                - **Rule**: Whenever you receive a "CANDIDATE CODE UPDATE", do NOT speak immediately unless the candidate explicitly asks "What do you think?" or "Is this correct?".
                - **Rule**: Silently absorb the code into your logic for the next turn of the conversation.
                - **Rule**: Do not tell the candidate the answer by yourself unless they explicitly ask for help.

                # Voice Output & Formatting
                - **NO Full Stops**: Never use periods (.) to end sentences. Use commas or line breaks.
                - **Plain Text Only**: No markdown, no bolding (**), and no backticks (code blocks) in your speech.
                - **Brevity**: 1-3 sentences maximum per turn to keep it conversational.
                """
        )
    # def log_context_attributes(self, chat_ctx):
    #     print("--- CHAT CONTEXT DEBUG START ---")
    #     print(f"Object Type: {type(chat_ctx)}")
    #     print(f"All Attributes: {dir(chat_ctx)}")
    #     # Try to see if it has a common private name like _messages
    #     if hasattr(chat_ctx, '_messages'):
    #         print(f"Found _messages! Count: {len(chat_ctx._messages)}")
    #     print("--- CHAT CONTEXT DEBUG END ---")
    
    
    
    
    
    
    
    def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
        """Injects code as a USER turn so the LLM 'hears' the update."""
        self.current_code = code
        
        try:
            content_part = llm.ChatContext(text=f"CANDIDATE CODE UPDATE:\n{code}")
            # 1. Create the message using the list format required by Pydantic v2
            new_msg = llm.ChatMessage(
                role=llm.ChatRole.USER,
                # content=[llm.TextContent(text=f"CANDIDATE CODE UPDATE:\n{code}")]
                content=[content_part]
            )

            # 2. Append to the context safely
            # Most LiveKit ChatContext objects expose a 'messages' list attribute
            if hasattr(chat_ctx, 'messages'):
                chat_ctx.messages.append(new_msg)
                print(f"📥 [CONTEXT_SYNC] Code appended successfully to chat_ctx.messages")
            else:
                # Fallback for internal variations
                msgs_list = getattr(chat_ctx, '_messages', None)
                if msgs_list is not None:
                    msgs_list.append(new_msg)
                    print(f"📥 [CONTEXT_SYNC] Code appended to private _messages")
                    
        except Exception as e:
            print(f"❌ [CONTEXT_FATAL] Failed to update code context: {e}")
        
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    # def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
    #     """Injects code by bypassing factory methods and using private attributes."""
    #     self.current_code = code
        
    #     # 1. Manually construct the message object
    #     # Using a dictionary is the safest way to avoid the Union/Instantiate error
    #     try:
    #         # content_list = [llm.ChatContent(text=f"CANDIDATE CODE UPDATE:\n{code}")]
    #         new_msg = llm.ChatMessage(
    #             # Pydantic v2: content must be a list[ChatContent]
    #             content=[llm.TextContent(text=f"CANDIDATE CODE UPDATE:\n{code}")],
    #             role=llm.ChatRole.USER,
    #         )
    #         print(f"DEBUG: Created new_msg of type {type(new_msg)} with content type {type(new_msg.content)}")
    #         # 2. Access the hidden messages list
    #         # We use getattr to find _messages (which appeared in your dir() logs)
    #         msgs_list = getattr(chat_ctx, '_messages', getattr(chat_ctx, 'messages', None))
            
    #         if msgs_list is not None:
    #             msgs_list.append(new_msg)
    #             print(f"📥 [CONTEXT_SYNC] Code appended manually to _messages")
    #         else:
    #             print(f"❌ [CONTEXT_ERROR] Attribute not found. dir: {dir(chat_ctx)}")
                
    #     except Exception as e:
    #         print(f"❌ [CONTEXT_FATAL] Manual append failed: {e}")












    # def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
    #     """Injects code as a USER turn so the LLM 'hears' the update."""
    #     self.current_code = code
    #     # Check if the SDK expects a list of content parts
    #     # We wrap the text in a list to satisfy the 'Input should be a valid list' requirement
    #     # content_payload = [llm.ChatContent(text=f"CANDIDATE CODE UPDATE:\n{code}")]
    #     # # We add this as a USER role so the LLM treats it as an active event in the conversation
    #     # print(f"DEBUG: [CODE_CONTEXT] Preparing to append code to chat context")
    #     # print(f"DEBUG: chat_ctx type: {type(chat_ctx)}, messages type: {type(chat_ctx.messages)}")
    #     # print(f"DEBUG: Last message before code append: {chat_ctx.messages[-1] if chat_ctx.messages else 'No messages yet'}")
    #     # code_message = llm.ChatMessage(
    #     #     role="user", 
    #     #     # content=f"CANDIDATE CODE UPDATE:\n{code}"
    #     #     content=content_payload
    #     # )
    #     # chat_ctx.messages.append(code_message)
    #     # print(f"📥 [CONTEXT_SYNC] Code appended to timeline")
        
    #     # .create() handles the 'typing.Union' logic internally so you don't have to
    #     code_message = llm.ChatMessage(
    #         role="user", 
    #         text=f"CANDIDATE CODE UPDATE:\n{code}"
    #     )
    #     print(f"DEBUG: [CODE_CONTEXT] Preparing to append code to chat context")
    #     print(self.log_context_attributes(chat_ctx))
    #     try:
    #         # Safely find the messages list (some versions use _messages, some use messages)
    #         msgs_list = getattr(chat_ctx, '_messages', getattr(chat_ctx, 'messages', None))
            
    #         if msgs_list is not None:
    #             msgs_list.append(code_message)
    #             print(f"📥 [CONTEXT_SYNC] Code appended to timeline")
    #         else:
    #             print("❌ [CONTEXT_ERROR] Could not find messages list in ChatContext")
    #     except Exception as e:
    #         print(f"❌ [CONTEXT_FATAL] {e}")
    #     #     chat_ctx.messages.append(code_message)
    #     #     print(f"📥 [CONTEXT_SYNC] Code appended successfully")
    #     # except Exception as e:
    #     #     print(f"❌ [CONTEXT_ERROR] Factory method failed: {e}")
    #     #     # Absolute fallback: Raw dictionary (some SDK versions prefer this)
    #     #     chat_ctx.messages.append({
    #     #         "role": "user",
    #     #         "content": f"CANDIDATE CODE UPDATE:\n{code}"
    #     #     })

    # async def tts_node(self, text_stream, model_settings):
    #     async def monitor_text(stream):
    #         full_text = ""
    #         async for text in stream:
    #             try:
    #                 # STRIP token from any tts chunk so frontend doesn't see it
    #                 if isinstance(text, str) and re.search(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", text, flags=re.IGNORECASE):
    #                     # Found token in TTS chunk — clean and trigger immediate signal if not already done
    #                     clean_text = re.sub(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", "", text, flags=re.IGNORECASE)
    #                     print(f"DEBUG: [TTS_CHUNK_MATCH] raw='{text[:120]}' cleaned='{(clean_text or '')[:120]}'")
    #                     # If the end-signal hasn't been sent yet, ensure we send it now.
    #                     try:
    #                         if not getattr(self, '_end_signal_event', None) or not self._end_signal_event.is_set():
    #                             print(f"DEBUG: [TTS_TRIGGER] initiating immediate signal from tts_node for {self.session_id}")
    #                             await self.immediate_signal_and_db()
    #                     except Exception as e:
    #                         print(f"❌ [TTS_TRIGGER_ERR] {e}")
    #                 else:
    #                     clean_text = text.replace('[[END_INTERVIEW]]', '') if isinstance(text, str) else text
    #             except Exception:
    #                 clean_text = text

    #             # Debug: log potential token fragments or notable chunks
    #             try:
    #                 if isinstance(text, str) and ("[[" in text or "END_INTERVIEW" in text or "END INTERVIEW" in text):
    #                     print(f"DEBUG: [TTS_CHUNK] raw='{text[:120]}' cleaned='{(clean_text or '')[:120]}'")
    #             except Exception:
    #                 pass

    #             if isinstance(clean_text, str) and clean_text.strip():
    #                 full_text += clean_text

    #             # Yield cleaned text to the downstream TTS pipeline
    #             yield clean_text

    #         if full_text.strip() and self._room:
    #             try:
    #                 # Debug: show outgoing assistant transcript
    #                 print(f"DEBUG: [TTS_PUBLISH] assistant transcript length={len(full_text.strip())}")
    #                 transcript_data = json.dumps({
    #                     "type": "transcript",
    #                     "role": "assistant",
    #                     "content": full_text.strip()
    #                 })
    #                 # Wait briefly for the end-signal to be sent so ordering is preserved
    #                 try:
    #                     await asyncio.wait_for(self._end_signal_event.wait(), timeout=2)
    #                     print('DEBUG: [TTS_WAIT] end-signal observed before publish')
    #                 except asyncio.TimeoutError:
    #                     print('DEBUG: [TTS_WAIT] timeout while waiting for end-signal (proceeding)')

    #                 await self._room.local_participant.publish_data(
    #                     transcript_data.encode('utf-8'),
    #                     reliable=True
    #                 )
    #                 print("✅ [TTS_PUBLISHED] assistant transcript sent to frontend")
    #             except Exception as e:
    #                 print(f"❌ Failed to send transcript: {e}")

    #     return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)

    # async def llm_node(self, chat_ctx: llm.ChatContext, tools, model_settings):
    #     """Intercept LLM output stream and react to the end-interview token."""
    #     print(f"DEBUG: [LLM_NODE] Processing new turn for session {self.session_id}")
    #     async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
    #         try:
    #             # Normalize content extraction for different chunk shapes
    #             content = None
    #             if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
    #                 delta = getattr(chunk.choices[0], 'delta', None)
    #                 content = getattr(delta, 'content', None)
    #             elif isinstance(chunk, str):
    #                 content = chunk

    #             # Debug: log potential token fragments
    #             try:
    #                 if isinstance(content, str) and ("[[" in content or "END_INTERVIEW" in content or "END INTERVIEW" in content):
    #                     print(f"DEBUG: [LLM_CHUNK_INTERCEPT] Potential token fragment: '{content[:160]}'")
    #             except Exception:
    #                 pass

    #             # Check for several token shapes using regex to avoid misses
    #             if content and isinstance(content, str) and re.search(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", content, flags=re.IGNORECASE):
    #                 print(f"🎯🎯🎯 [MATCH] FOUND END TOKEN IN STREAM")

    #                 # 1. Strip the token so downstream TTS/transcript doesn't see it
    #                 try:
    #                     if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
    #                         new_content = re.sub(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", "", content, flags=re.IGNORECASE)
    #                         chunk.choices[0].delta.content = new_content
    #                         print(f"DEBUG: [LLM_STRIP] chunk content cleaned to '{(new_content or '')[:160]}'")
    #                 except Exception as e:
    #                     print(f"❌ [STRIP_ERR] {e}")

    #                 # 2. Trigger evaluation and close immediately (synchronous within this turn)
    #                 try:
    #                     print(f"DEBUG: [SHUTDOWN] Sending immediate signal for {self.session_id}")
    #                     await self.immediate_signal_and_db()
    #                 except Exception as e:
    #                     print(f"❌ [IMMEDIATE_SIGNAL_ERR] {e}")
    #         except Exception as e:
    #             print(f"❌ [LLM_NODE_ERROR] {e}")
    #         yield chunk


    async def tts_node(self, text_stream, model_settings):
            async def monitor_text(stream):
                full_text = ""
                async for text in stream:
                    # 1. Handle potential List/Union types coming from the LLM
                    if not isinstance(text, str):
                        continue

                    try:
                        # 2. STRIP token and check for ending
                        if re.search(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", text, flags=re.IGNORECASE):
                            clean_text = re.sub(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", "", text, flags=re.IGNORECASE)
                            # Trigger shutdown logic
                            if not self._end_signal_event.is_set():
                                asyncio.create_task(self.immediate_signal_and_db())
                        else:
                            clean_text = text.replace('[[END_INTERVIEW]]', '')
                    except Exception:
                        clean_text = text

                    if clean_text.strip():
                        full_text += clean_text

                    yield clean_text

                # 3. SEND TRANSCRIPT AFTER STREAM COMPLETES
                if full_text.strip() and self._room:
                    try:
                        transcript_data = json.dumps({
                            "type": "transcript",
                            "role": "assistant",
                            "content": full_text.strip()
                        })
                        # Use the reliable room local participant to publish
                        await self._room.local_participant.publish_data(
                            transcript_data.encode('utf-8'),
                            reliable=True
                        )
                        print(f"✅ [TTS_TRANSCRIPT_SENT] {full_text[:30]}...")
                    except Exception as e:
                        print(f"❌ [TTS_TRANSCRIPT_FAIL] {e}")

            return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)
#     async def immediate_signal_and_db(self):
#         """Generate REAL LLM evaluation before signaling end."""
#         try:
#             print(f"🤖 [EVAL_START] Generating real evaluation for {self.session_id}")

#             # 1. BUILD CONTEXT FOR EVALUATION (use session.chat_ctx)
#             eval_context = []
#             session = getattr(self, '_session', None)
#             print(f"🔍 [EVAL_DEBUG] Session available: {session is not None}")

#             if session and getattr(session, 'chat_ctx', None) and getattr(session.chat_ctx, 'messages', None):
#                 for msg in session.chat_ctx.messages[-20:]:
#                     try:
#                         if getattr(msg, 'role', None) in ['user', 'assistant'] and getattr(msg, 'content', None):
#                             content = str(getattr(msg, 'content', '')).strip()
#                             if content and not content.startswith('CANDIDATE CODE'):
#                                 role = 'Candidate' if getattr(msg, 'role') == 'user' else 'Interviewer'
#                                 eval_context.append(f"{role}: {content}")
#                     except Exception:
#                         continue

#             # Add final code if present
#             try:
#                 if getattr(self, 'current_code', '') and str(self.current_code).strip():
#                     eval_context.append(f"\nFINAL CODE:\n{self.current_code}")
#             except Exception:
#                 pass

#             context_str = "\n\n".join(eval_context[-15:])
#             print(f"📚 [CONTEXT] {len(eval_context)} messages → {len(context_str)} chars")

#             # 2. LLM EVALUATION PROMPT
#             eval_prompt = f"""# EVALUATION TASK
# Review this coding interview and generate structured feedback:

# CONTEXT:
# {context_str}

# Generate JSON evaluation with:
# {{"strengths": ["bullet 1", "bullet 2"], 
#   "improvements": ["bullet 1", "bullet 2"], 
#   "edgeCases": ["case 1", "case 2"], 
#   "nextSteps": ["action 1", "action 2"],
#   "overallScore": "A/B/C/D/F",
#   "technicalLevel": "Junior/Mid/Senior"}}

# Be specific about code quality, problem-solving, communication.
# Keep each bullet 1 sentence max."""

#             # 3. CALL GROQ SDK FOR EVALUATION (sync client run in executor)
#             try:
#                 loop = asyncio.get_event_loop()
#                 response = await loop.run_in_executor(
#                     None,
#                     lambda: Groq(api_key=os.getenv("GROQ_API_KEY")).chat.completions.create(
#                         model="llama-3.1-8b-instant",
#                         messages=[{"role": "user", "content": eval_prompt}],
#                         temperature=0.3,
#                         max_tokens=800
#                     )
#                 )
#                 try:
#                     eval_raw = response.choices[0].message.content.strip()
#                 except Exception:
#                     eval_raw = str(response).strip()
#                 print(f"📊 [LLM_EVAL_RAW] {eval_raw[:300]}...")
#             except Exception as e:
#                 print(f"❌ [GROQ_ERROR] {e}")
#                 eval_raw = ""

#             # 4. PARSE JSON EVALUATION
#             try:
#                 json_match = re.search(r'\{.*\}', eval_raw, re.DOTALL)
#                 if json_match:
#                     eval_json_str = json_match.group()
#                     evaluation = json.loads(eval_json_str)
#                 else:
#                     evaluation = json.loads(eval_raw)
#             except Exception as e:
#                 print(f"⚠️ [EVAL_PARSE_FAIL] {e}, using fallback")
#                 evaluation = {
#                     "strengths": ["Evaluation generation failed - review manually"],
#                     "improvements": [],
#                     "edgeCases": [],
#                     "nextSteps": ["Follow up with candidate"],
#                     "overallScore": "TBD",
#                     "technicalLevel": "Unknown"
#                 }

#             print(f"✅ [REAL_EVAL_GENERATED]")
#             print(f"   Strengths: {evaluation.get('strengths', [])}")
#             print(f"   Score: {evaluation.get('overallScore', 'N/A')}")
#             print(f"   Level: {evaluation.get('technicalLevel', 'N/A')}")

#             # 5. COLLECT TRANSCRIPTS FROM MONGO
#             schema_transcripts = []
#             try:
#                 doc = sessions_collection.find_one({'sessionId': self.session_id})
#                 if doc and isinstance(doc.get('transcripts'), list):
#                     for t in doc.get('transcripts', []):
#                         role_raw = t.get('role') if isinstance(t, dict) else None
#                         role = 'user' if role_raw == 'user' else 'assistant'
#                         content = (t.get('content') if isinstance(t, dict) else str(t)) or ''
#                         content = content.strip()
#                         if content:
#                             schema_transcripts.append({
#                                 'role': role,
#                                 'content': content,
#                                 'timestamp': t.get('timestamp') if isinstance(t, dict) and t.get('timestamp') else None
#                             })
#             except Exception as e:
#                 print(f"⚠️ [TRANSCRIPTS_READ_ERR] {e}")

#             # 6. POST TO BACKEND WITH REAL EVALUATION
#             backend_url = os.getenv('BACKEND_URL', 'http://localhost:5000')
#             eval_endpoint = f"{backend_url}/api/sessions/{self.session_id}/evaluation"

#             payload = {
#                 'status': 'evaluated',
#                 'endedAt': datetime.datetime.utcnow().isoformat(),
#                 'finalCode': self.current_code or '',
#                 'transcripts': schema_transcripts,
#                 'evaluation': {
#                     **evaluation,
#                     'generatedAt': datetime.datetime.utcnow().isoformat()
#                 }
#             }

#             async with aiohttp.ClientSession() as session:
#                 try:
#                     print(f"📡 [HTTP_POST] Sending REAL evaluation to {eval_endpoint}")
#                     resp = await session.put(eval_endpoint, json=payload, timeout=10)
#                     text = await resp.text()
#                     if resp.status in (200, 201):
#                         print(f"✅ [BACKEND_ACCEPTED] Real evaluation saved!")
#                     else:
#                         print(f"❌ [BACKEND_ERROR] {resp.status}: {text}")
#                 except Exception as e:
#                     print(f"❌ [HTTP_FAIL] {e}")

#             # 7. CONTINUE WITH SIGNAL + CLEANUP
#             try:
#                 await self._send_end_signal()
#             except Exception:
#                 pass
#             try:
#                 self._end_signal_event.set()
#             except Exception:
#                 pass
#             try:
#                 asyncio.create_task(self._delayed_disconnect())
#             except Exception:
#                 pass

#         except Exception as e:
#             print(f"❌ [REAL_EVAL_FATAL] {e}")
#             # Fallback to old placeholder logic
#             try:
#                 await self._send_end_signal()
#             except Exception:
#                 pass


    async def immediate_signal_and_db(self):
            """Fixed: Safe memory access + Backend POST + Real Transcript storage."""
            try:
                print(f"🤖 [EVAL_START] Generating real evaluation for {self.session_id}")

                # 1. BUILD CONTEXT FOR EVALUATION
                eval_context = []
                session = getattr(self, '_session', None)
                
                # Accessing private _chat_ctx found in your debug logs
                ctx_obj = getattr(session, '_chat_ctx', getattr(session, 'chat_ctx', None))

                if ctx_obj and hasattr(ctx_obj, 'messages'):
                    # Grab more history (25 turns) for a better evaluation
                    # for msg in ctx_obj.messages[-25:]:
                    #     try:
                    #         # --- FIX FOR Union/List Content Error ---
                    #         content_raw = msg.content
                    #         if isinstance(content_raw, list):
                    #             # Extract text from the list of ChatContent objects
                    #             text_content = " ".join([part.text for part in content_raw if hasattr(part, 'text')])
                    #         else:
                    #             text_content = str(content_raw)

                    #         text_content = text_content.strip()
                            
                    #         # Only add actual conversation, skip the raw code update blocks for the transcript
                    #         if text_content and not text_content.startswith('CANDIDATE CODE UPDATE'):
                    #             role = 'Candidate' if msg.role == 'user' else 'Interviewer'
                    #             eval_context.append(f"{role}: {text_content}")
                    #     except Exception as e:
                    #         print(f"⚠️ [EVAL_MSG_SKIP] {e}")
                    #         continue
                    for msg in ctx_obj.messages[-25:]:
                        try:
                            # Extract text safely regardless of whether it's a string or list
                            if isinstance(msg.content, list):
                                text_content = " ".join([part.text for part in msg.content if hasattr(part, 'text')])
                            else:
                                text_content = str(msg.content)

                            text_content = text_content.strip()
                            
                            # Skip internal markers
                            if text_content and not text_content.startswith('CANDIDATE CODE UPDATE'):
                                role = 'Candidate' if msg.role == llm.ChatRole.USER else 'Interviewer'
                                eval_context.append(f"{role}: {text_content}")
                        except Exception as e:
                            continue
                # Add final code block to the context so LLM can grade the actual code
                if self.current_code:
                    eval_context.append(f"\nFINAL SOURCE CODE:\n{self.current_code}")

                context_str = "\n\n".join(eval_context)
                print(f"📚 [CONTEXT] Collected {len(eval_context)} conversation items")

                # 2. LLM EVALUATION PROMPT
                eval_prompt = f"""# EVALUATION TASK
    Review this coding interview and generate structured JSON feedback.

    CONTEXT:
    {context_str}

    Generate JSON evaluation exactly like this:
    {{
    "strengths": ["bullet 1", "bullet 2"], 
    "improvements": ["bullet 1", "bullet 2"], 
    "edgeCases": ["case 1", "case 2"], 
    "nextSteps": ["action 1", "action 2"],
    "overallScore": "A/B/C/D/F",
    "technicalLevel": "Junior/Mid/Senior"
    }}"""

                # 3. CALL GROQ SDK (Run sync call in executor)
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: Groq(api_key=os.getenv("GROQ_API_KEY")).chat.completions.create(
                        model="llama-3.1-8b-instant",
                        messages=[{"role": "user", "content": eval_prompt}],
                        temperature=0.1,
                        response_format={ "type": "json_object" }
                    )
                )
                
                try:
                    eval_raw = response.choices[0].message.content.strip()
                    evaluation = json.loads(eval_raw)
                except Exception as e:
                    print(f"⚠️ [JSON_PARSE_FAIL] {e}")
                    evaluation = {"strengths": ["Manual review required"]}

                # 4. PREPARE PAYLOAD FOR DATABASE AND BACKEND
                # We store the eval_context list as the 'transcripts' field
                payload = {
                    'status': 'evaluated',
                    'endedAt': datetime.datetime.utcnow().isoformat(),
                    'finalCode': self.current_code or '',
                    'transcripts': eval_context, # THIS stores your conversation history!
                    'evaluation': {
                        **evaluation,
                        'generatedAt': datetime.datetime.utcnow().isoformat()
                    }
                }

                # 5. UPDATE MONGODB
                # await loop.run_in_executor(None, lambda: sessions_collection.update_one(
                #     {"sessionId": self.session_id},
                #     {"$set": payload}
                # ))
                await loop.run_in_executor(None, lambda: local_db.update_session(self.session_id, payload))
                print("✅ [DB_SUCCESS] Evaluation and transcript saved to Mongo.")

                # 6. POST TO BACKEND API
                backend_url = os.getenv('BACKEND_URL', 'http://localhost:5000')
                eval_endpoint = f"{backend_url}/api/sessions/{self.session_id}/evaluation"

                async with aiohttp.ClientSession() as http_session:
                    try:
                        print(f"📡 [HTTP_POST] Sending payload to {eval_endpoint}")
                        resp = await http_session.put(eval_endpoint, json=payload, timeout=10)
                        if resp.status in (200, 201):
                            print(f"✅ [BACKEND_ACCEPTED] API updated successfully")
                        else:
                            text = await resp.text()
                            print(f"❌ [BACKEND_ERROR] {resp.status}: {text}")
                    except Exception as e:
                        print(f"❌ [HTTP_FAIL] {e}")

                # 7. CLEANUP AND DISCONNECT
                await self._send_end_signal()
                self._end_signal_event.set()
                asyncio.create_task(self._delayed_disconnect())

            except Exception as e:
                print(f"❌ [REAL_EVAL_FATAL] {e}")
                await self._send_end_signal()

    async def _send_end_signal(self):
        """Extracted signal logic for reuse."""
        try:
            if self._room:
                payload = json.dumps({"type": "interview_end", "sessionId": self.session_id})
                await self._room.local_participant.publish_data(payload.encode('utf-8'), reliable=True)
                print("✅ [SIGNAL_SENT] Frontend notified")
        except Exception as e:
            print(f"❌ [SIGNAL_ERR] {e}")

    async def _delayed_disconnect(self):
        try:
            await asyncio.sleep(6)
            if self._room:
                try:
                    await self._room.disconnect()
                    print("🔌 [DISCONNECT] Room disconnected after delayed wait")
                except Exception as e:
                    print(f"❌ [DISCONNECT_ERR] {e}")
        except Exception as e:
            print(f"❌ [DELAYED_DISCONNECT_FATAL] {e}")

    async def perform_evaluation_and_close(self, chat_ctx: llm.ChatContext):
        """Save final state, signal frontend, and gracefully disconnect the room."""
        try:
            print(f"🚀 [START_SHUTDOWN] Sequence initiated for {self.session_id}")

            # 1. GENERATE EVALUATION (Simplified placeholder or LLM pass can be added)
            print("DEBUG: [EVAL] Preparing evaluation payload (placeholder)")
            eval_placeholder = {"strengths": ["Completed interview"], "improvements": [], "edgeCases": [], "nextSteps": []}

            # 2. UPDATE DATABASE with evaluation
            try:
                loop = asyncio.get_event_loop()
                # await loop.run_in_executor(None, lambda: sessions_collection.update_one(
                #     {"sessionId": self.session_id},
                #     {"$set": {
                #         "status": "completed",
                #         "finalCode": self.current_code,
                #         "evaluation": eval_placeholder,
                #         "completedAt": True
                #     }}
                # ))
                update_data = {
                    "status": "completed",
                    "finalCode": self.current_code,
                    "evaluation": eval_placeholder,
                    "completedAt": True
                }
                await loop.run_in_executor(None, lambda: local_db.update_session(self.session_id, update_data))
                print("✅ [DB_SUCCESS] Evaluation and status saved.")
            except Exception as e:
                print(f"❌ [DB_ERR] {e}")

            # 3. SIGNAL FRONTEND that interview ended
            if self._room:
                try:
                    end_payload = json.dumps({"type": "interview_end", "sessionId": self.session_id})
                    print(f"DEBUG: [SIGNAL_SEND] Sending payload: {end_payload}")
                    await self._room.local_participant.publish_data(end_payload.encode('utf-8'), reliable=True)
                    print("✅ [DATA] interview_end sent to frontend")
                except Exception as e:
                    print(f"❌ [DATA_SEND_ERR] {e}")

            # 4. WAIT & DISCONNECT
            print("DEBUG: [SLEEP] Waiting 5s for TTS audio to clear...")
            await asyncio.sleep(5)
            if self._room:
                try:
                    print("🔌 [DISCONNECT] Leaving room now")
                    await self._room.disconnect()
                    print("🔌 [ROOM] Agent disconnected successfully.")
                except Exception as e:
                    print(f"❌ [ROOM_DISCONNECT_ERR] {e}")
        except Exception as e:
            print(f"❌ [PERFORM_CLOSE_FATAL] {e}")

server = AgentServer()

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    await ctx.connect()
    _active_tasks = set()   
    candidate = await ctx.wait_for_participant()
    global CURRENT_ROOM
    CURRENT_ROOM = ctx.room

    loop = asyncio.get_event_loop()
    local_db.print_all_sessions()
    # Resolve Session ID
    session_id = ctx.room.name.replace("interview-", "")
    if ctx.room.metadata:
        try:
            metadata_json = json.loads(ctx.room.metadata)
            session_id = metadata_json.get("sessionId", session_id)
        except: pass

    print(f"🚀 [START] Processing Session: {session_id}")

    full_question_data = None
    try:
        session_doc = None
        # Increase attempts to 5 for better stability
        for attempt in range(5):
            session_doc = await loop.run_in_executor(None, lambda: local_db.get_session(session_id))
            if session_doc:
                print(f"✅ [DB_HIT] Session document found on attempt {attempt+1}")
                break
            print(f"⏳ [DB_RETRY] Session '{session_id}' not found, retrying...")
            await asyncio.sleep(1.5)
        
        if session_doc:
            meta = session_doc.get('metadata', {})
            q_id = meta.get('questionId')
            print(f"🔖 [METADATA] Extracted questionId: {q_id}")
            
            if q_id:
                full_question_data = await loop.run_in_executor(None, lambda: local_db.get_question_by_id(q_id))
        else:
            print(f"❌ [DB_FAIL] Session '{session_id}' completely missing from DB after 5 tries.")
            debug = local_db.get_debug_info()
            print(f"💡 [DIAGNOSTIC] DB Status: {debug}")

    except Exception as e:
        print(f"🚨 [ERROR] entrypoint DB logic: {e}")

    # Fallback Data
    if not full_question_data:
        print("⚠️ [FALLBACK] Using generic instructions")
        full_question_data = {
            "title": "the assigned problem", 
            "description": "the requirements shown on the screen",
            "exampleInput": "the provided examples",
            "exampleOutput": "the expected output",
        }

    print(f"📝 [PROMPT_PREP] Preparing AI Chris for problem: {full_question_data.get('title')}")

    assistant = InterviewAssistant(full_question_data, ctx.room, session_id=session_id)
    # try:
    #     # 1. Try to get the clean ID from Room Metadata first
    #     session_id = None
    #     if ctx.room.metadata:
    #         try:
    #             metadata = json.loads(ctx.room.metadata)
    #             session_id = metadata.get("sessionId")
    #             print(f"📋 [METADATA] Successfully parsed SessionId: {session_id}")
    #         except json.JSONDecodeError:
    #             print("⚠️ [METADATA] Failed to parse JSON metadata")

    #     # 2. Fallback: If metadata is empty, strip the prefix from the room name
    #     if not session_id:
    #         session_id = ctx.room.name.replace("interview-", "")
    #         print(f"✂️ [STRIP] Using stripped room name as ID: {session_id}")
    #     # 2. DEBUG: Print exactly what we are looking for
    #     print(f"🔍 [DB_QUERY] Searching for sessionId: '{session_id}' in collection: {sessions_collection.name}")
    #     # 3. Query MongoDB for the specific session created by your backend
    #     session_data = await loop.run_in_executor(
    #         None, lambda: sessions_collection.find_one({"sessionId": session_id})
    #     )

    #     if session_data and "questionsAsked" in session_data:
    #         # Fetch the actual question title chosen by your backend
    #         question = session_data["questionsAsked"][0]
    #         print(f"✅ [DYNAMIC_FETCH] Found question from backend: {question}")
    #     else:
    #         # If DB lookup still fails, log exactly what we searched for
    #         print(f"❌ [DB_ERR] No session found in DB for ID: {session_id}")
    #         question = "the assigned coding problem" # Neutral fallback

    # except Exception as e:
    #     print(f"⚠️ [FATAL_FETCH_ERROR] {e}")
    #     question = "the coding exercise"
    # try:
    #     session_id = ctx.room.name
    #     if ctx.room.metadata:
    #         metadata = json.loads(ctx.room.metadata)
    #         session_id = metadata.get("sessionId", session_id)

    #     session_data = await loop.run_in_executor(
    #         None, lambda: sessions_collection.find_one({"sessionId": session_id})
    #     )
    #     question = session_data.get("questionsAsked", ["Tell me about yourself"])[0] if session_data else "Hello!"
    # except Exception as e:
    #     print(f"⚠️ DB Error: {e}")
    #     question = "Tell me about yourself."
          
    # assistant = InterviewAssistant(question, ctx.room, session_id=session_id)
    # Session will be created next; attach it to the assistant after creation so it's defined

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model="nova-2"),
        llm=groq.LLM(model="llama-3.1-8b-instant"),
        # tts=deepgram.TTS(
        #     model="aura-asteria-en",
        #     api_key=os.getenv("DEEPGRAM_API_KEY")
        # )
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            # model="eleven_multilingual_v2",
            model="eleven_multilingual_v2",
            voice_id=os.getenv("ELEVENLABS_VOICE_ID")
        )
    )
    # PRINT ALL ATTRIBUTES TO SEE THE REAL NAME
    print(f"DEBUG: Session attributes: {dir(session)}")
    # Keep a reference to the session on the assistant so hidden evaluation can access chat_ctx
    assistant._session = session
    
    @session.on("agent_speech_committed")
    def on_agent_speech_committed(msg: llm.ChatMessage):
        """
        This event triggers whenever Chris finishes generating a sentence.
        It is the most reliable way to send transcripts to the frontend.
        """
        content = msg.content
        if isinstance(content, list):
            text = " ".join([part.text for part in content if hasattr(part, 'text')])
        else:
            text = str(content)

        if text.strip():
            print(f"🎙️ [AGENT_TRANSCRIPT] Sending: {text[:50]}...")
            payload = json.dumps({
                "type": "transcript",
                "role": "assistant",
                "content": text.strip()
        })
        # Use the loop to ensure it doesn't get lost in async transitions
        asyncio.get_event_loop().call_soon_threadsafe(
            lambda: asyncio.create_task(ctx.room.local_participant.publish_data(payload.encode('utf-8'), reliable=True))
        )
    # --- DATA CHANNEL LISTENER: Listen for 'request_end' packets from frontend ---
    @ctx.room.on("data_received")
    def on_data_received(packet: rtc.DataPacket):
        try:
            payload = json.loads(packet.data.decode('utf-8'))
            if payload.get("type") == "request_end":
                print(f"🛑 [SIGNAL] User clicked End Interview button for {session_id}")
                # Use the SAME logic used for the voice END token
                # We wrap it in a task so it doesn't block the data thread
                asyncio.create_task(assistant.immediate_signal_and_db())
        except Exception as e:
            print(f"❌ [DATA_PARSE_ERR] {e}")

    # --- TEXT STREAM HANDLER (Replaces data_received) ---
    
    async def handle_code_stream(reader: rtc.TextStreamReader, participant_identity: str):
        """Process the incoming code stream exactly like audio STT."""
        try:
            # Wait for the complete code text from the stream
            code_content = await reader.read_all()
            print(f"DEBUG: Received code content of type {type(code_content)}")
            if code_content:
            # SAFETY CHECK: Access the private _chat_ctx found in your logs
                # ctx_obj = getattr(session, '_chat_ctx', None)
                ctx_obj = getattr(session, '_chat_ctx', getattr(session, 'chat_ctx', None))
                print(f"DEBUG: Retrieved chat_ctx: {ctx_obj is not None}")
                print(f"DEBUG: chat_ctx type: {type(ctx_obj)}")
                if ctx_obj:
                    assistant.update_code_context(code_content, ctx_obj)
                        # Avoid using removed `is_speaking` API. Prefer agent state tracking.
                    agent_state = getattr(assistant, '_agent_state', None)
                    if agent_state != 'speaking':
                        print("🤖 [REPLY] Triggering AI thought process...")
                        # call generate_reply non-blocking as before
                        session.generate_reply()
                    else:
                        print("🔇 [SKIP_REPLY] Agent currently speaking; skipping generate_reply")
                if ctx_obj is None:
                    print("❌ [CRITICAL] Could not find _chat_ctx on session object")
                    return
            # if code_content:
                # 1. Update the brain context
            # assistant.update_code_context(code_content, ctx_obj)
            print(f"📝 [CODE_UPDATE] Code received from {participant_identity}, length={len(code_content)}")
            print(f"-----\n{code_content}\n-----")
            print(f"📥 [CODE_SYNC] Code context updated in LLM history")
                # 2. Trigger the LLM to generate a reply (mimics speech committed)
            # asyncio.create_task(session.generate_reply())
                
            print(f"📄 [STREAM] Received code update from {participant_identity}")
        except Exception as e:
            print(f"⚠️ [STREAM_ERROR] {e}")

    def stream_callback(reader, participant_identity):
        """Wrapper to bridge sync callback to async handler."""
        task = asyncio.create_task(handle_code_stream(reader, participant_identity))
        _active_tasks.add(task)
        task.add_done_callback(_active_tasks.discard)

    # Register the handler on the topic 'code-update'
    ctx.room.register_text_stream_handler("code-update", stream_callback)

    # --- SESSION EVENTS ---

    @session.on("agent_state_changed")
    def on_state_change(ev):
        try:
            # Broadcast the agent's state to the frontend
            state_payload = json.dumps({
                "type": "state",
                "state": str(ev.new_state).split('.')[-1].lower()
            })
            asyncio.create_task(ctx.room.local_participant.publish_data(
                state_payload.encode('utf-8'),
                reliable=True
            ))
            # Keep a local copy of the agent state on the assistant for sync checks
            try:
                assistant._agent_state = str(ev.new_state).split('.')[-1].lower()
            except Exception:
                pass
        except Exception as e:
            print(f"❌ [STATE_BROADCAST_ERROR] {e}")
        print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    @session.on("user_speech_committed")
    def on_user_speech(msg: llm.ChatMessage):
        """Broadcast the user's transcript to the frontend when they finish speaking."""
        # This print MUST show up in your terminal for the data to reach the frontend
        print(f"🎯 [EVENT_TRIGGERED] user_speech_committed: {getattr(msg, 'content', None)}")
        try:
            if isinstance(msg.content, str) and msg.content.strip():
                text = msg.content.strip()
                payload = json.dumps({
                    "type": "transcript",
                    "role": "user",
                    "content": text
                })

                print(f"📡 [DATA_SENDING] User transcript: {text[:120]}")

                async def broadcast():
                    try:
                        await ctx.room.local_participant.publish_data(
                            payload.encode('utf-8'),
                            reliable=True
                        )
                        print(f"✅ [BROADCAST_SUCCESS] User transcript sent to frontend")
                    except Exception as e:
                        print(f"❌ [BROADCAST_ERROR] {e}")

                asyncio.create_task(broadcast())
        except Exception as e:
            print(f"❌ [BROADCAST_EXCEPTION] {e}")

    # Some STT plugins emit a different event name, add a fallback handler
    @session.on("user_transcript_finished")
    def on_final_transcript(transcript):
        try:
            text = None
            # transcript may be an object with .text or a simple string
            if hasattr(transcript, 'text'):
                text = transcript.text
            elif isinstance(transcript, str):
                text = transcript

            if text and isinstance(text, str) and text.strip():
                print(f"📢 [STT_FINISHED] {text}")
                payload = json.dumps({
                    "type": "transcript",
                    "role": "user",
                    "content": text.strip()
                })

                async def broadcast_final():
                    try:
                        await ctx.room.local_participant.publish_data(
                            payload.encode('utf-8'),
                            reliable=True
                        )
                        print(f"✅ [FINAL_BROADCAST] User transcript delivered")
                    except Exception as e:
                        print(f"❌ [FINAL_BROADCAST_FAILED] {e}")

                asyncio.create_task(broadcast_final())
        except Exception as e:
            print(f"❌ [STT_FALLBACK_ERROR] {e}")

    await session.start(room=ctx.room, agent=assistant)
    await asyncio.sleep(0.5)
    # Start a background task to monitor chat_ctx for new user messages
    async def monitor_chat_context():
        try:
            last_index = len(session.chat_ctx.messages) if hasattr(session, 'chat_ctx') and session.chat_ctx else 0
            print(f"🔎 [CHAT_CTX_MONITOR] starting at index {last_index}")
            while True:
                await asyncio.sleep(0.5)
                try:
                    if not hasattr(session, 'chat_ctx') or not session.chat_ctx:
                        continue
                    msgs = session.chat_ctx.messages
                    if len(msgs) > last_index:
                        # process new messages
                        for m in msgs[last_index:]:
                            try:
                                role = getattr(m, 'role', None)
                                content = getattr(m, 'content', None)
                                if role == 'user' and isinstance(content, str) and content.strip():
                                    # avoid echoing code update entries
                                    if content.strip().startswith('CANDIDATE CODE'):
                                        continue
                                    print(f"📣 [CHAT_CTX_NEW_USER] {content[:120]}")
                                    payload = json.dumps({
                                        "type": "transcript",
                                        "role": "user",
                                        "content": content.strip()
                                    })

                                    async def _b():
                                        try:
                                            await ctx.room.local_participant.publish_data(
                                                payload.encode('utf-8'),
                                                reliable=True
                                            )
                                            print("✅ [CHAT_CTX_BROADCAST] user message forwarded")
                                        except Exception as e:
                                            print(f"❌ [CHAT_CTX_BROADCAST_FAIL] {e}")

                                    asyncio.create_task(_b())
                            except Exception as me:
                                print(f"❌ [CHAT_CTX_MSG_ERROR] {me}")
                        last_index = len(msgs)
                except Exception as e:
                    print(f"❌ [CHAT_CTX_LOOP_ERROR] {e}")
        except asyncio.CancelledError:
            print("🔒 [CHAT_CTX_MONITOR] cancelled")
        except Exception as e:
            print(f"❌ [CHAT_CTX_MONITOR_FATAL] {e}")

    asyncio.create_task(monitor_chat_context())
    
    # Initial Greeting
    await session.generate_reply(
        instructions=f"Introduce yourself as Chris and askk candidate weather he is ready to discuss the problem '{full_question_data.get('title')}'."
    )

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)



