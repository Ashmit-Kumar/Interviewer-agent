import asyncio
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

load_dotenv()
logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO)
mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["interview-platform"]
sessions_collection = db["sessions"]    

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
    def __init__(self, question: str, room=None, session_id=None):
        question = question.replace('.', ',')
        self._room = room
        self.session_id = session_id
        # Event used to indicate the end-interview signal has been sent
        self._end_signal_event = asyncio.Event()
        self.current_code = ""
        super().__init__(
            instructions=f"""# Role
                You are Chris, a professional Technical Interviewer conducting a collaborative coding interview.

                # IMPORTANT: ENDING THE INTERVIEW (MANDATORY)
                - When the candidate confirms they want to end the interview, you MUST conclude the interview.
                - To conclude, say a brief warm one-sentence goodbye and then append the exact token [[END_INTERVIEW]] at the very end of your response.
                - THIS IS MANDATORY: include the token exactly as shown (no extra characters), the system will use it to finish the session.

                # Context
                Problem assigned: {question}

                # How to handle the Code Editor
                - You will receive "CANDIDATE CODE UPDATE" messages in your context history.
                - **Rule**: Whenever you see a new code block, analyze it silently.
                - **Rule**: Only speak if the candidate asks a question, or if they have finished a significant logic block and seem stuck.
                - **Rule**: Do not comment on every character.

                # Voice Output & Formatting
                - **NO Full Stops**: Never use FullStop(.) or periods to end the sentence.
                - **Plain Text Only**: No markdown or backticks.
                - **Brevity**: 1-3 sentences maximum.
                """
        )

    def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
        """Injects code as a USER turn so the LLM 'hears' the update."""
        self.current_code = code
        
        # We add this as a USER role so the LLM treats it as an active event in the conversation
        code_message = llm.ChatMessage(
            role="user", 
            content=f"CANDIDATE CODE UPDATE:\n{code}"
        )
        chat_ctx.messages.append(code_message)
        print(f"📥 [CONTEXT_SYNC] Code appended to timeline")

    async def tts_node(self, text_stream, model_settings):
        async def monitor_text(stream):
            full_text = ""
            async for text in stream:
                try:
                    # STRIP token from any tts chunk so frontend doesn't see it
                    if isinstance(text, str) and re.search(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", text, flags=re.IGNORECASE):
                        # Found token in TTS chunk — clean and trigger immediate signal if not already done
                        clean_text = re.sub(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", "", text, flags=re.IGNORECASE)
                        print(f"DEBUG: [TTS_CHUNK_MATCH] raw='{text[:120]}' cleaned='{(clean_text or '')[:120]}'")
                        # If the end-signal hasn't been sent yet, ensure we send it now.
                        try:
                            if not getattr(self, '_end_signal_event', None) or not self._end_signal_event.is_set():
                                print(f"DEBUG: [TTS_TRIGGER] initiating immediate signal from tts_node for {self.session_id}")
                                await self.immediate_signal_and_db()
                        except Exception as e:
                            print(f"❌ [TTS_TRIGGER_ERR] {e}")
                    else:
                        clean_text = text.replace('[[END_INTERVIEW]]', '') if isinstance(text, str) else text
                except Exception:
                    clean_text = text

                # Debug: log potential token fragments or notable chunks
                try:
                    if isinstance(text, str) and ("[[" in text or "END_INTERVIEW" in text or "END INTERVIEW" in text):
                        print(f"DEBUG: [TTS_CHUNK] raw='{text[:120]}' cleaned='{(clean_text or '')[:120]}'")
                except Exception:
                    pass

                if isinstance(clean_text, str) and clean_text.strip():
                    full_text += clean_text

                # Yield cleaned text to the downstream TTS pipeline
                yield clean_text

            if full_text.strip() and self._room:
                try:
                    # Debug: show outgoing assistant transcript
                    print(f"DEBUG: [TTS_PUBLISH] assistant transcript length={len(full_text.strip())}")
                    transcript_data = json.dumps({
                        "type": "transcript",
                        "role": "assistant",
                        "content": full_text.strip()
                    })
                    # Wait briefly for the end-signal to be sent so ordering is preserved
                    try:
                        await asyncio.wait_for(self._end_signal_event.wait(), timeout=2)
                        print('DEBUG: [TTS_WAIT] end-signal observed before publish')
                    except asyncio.TimeoutError:
                        print('DEBUG: [TTS_WAIT] timeout while waiting for end-signal (proceeding)')

                    await self._room.local_participant.publish_data(
                        transcript_data.encode('utf-8'),
                        reliable=True
                    )
                    print("✅ [TTS_PUBLISHED] assistant transcript sent to frontend")
                except Exception as e:
                    print(f"❌ Failed to send transcript: {e}")

        return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)

    async def llm_node(self, chat_ctx: llm.ChatContext, tools, model_settings):
        """Intercept LLM output stream and react to the end-interview token."""
        print(f"DEBUG: [LLM_NODE] Processing new turn for session {self.session_id}")
        async for chunk in Agent.default.llm_node(self, chat_ctx, tools, model_settings):
            try:
                # Normalize content extraction for different chunk shapes
                content = None
                if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                    delta = getattr(chunk.choices[0], 'delta', None)
                    content = getattr(delta, 'content', None)
                elif isinstance(chunk, str):
                    content = chunk

                # Debug: log potential token fragments
                try:
                    if isinstance(content, str) and ("[[" in content or "END_INTERVIEW" in content or "END INTERVIEW" in content):
                        print(f"DEBUG: [LLM_CHUNK_INTERCEPT] Potential token fragment: '{content[:160]}'")
                except Exception:
                    pass

                # Check for several token shapes using regex to avoid misses
                if content and isinstance(content, str) and re.search(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", content, flags=re.IGNORECASE):
                    print(f"🎯🎯🎯 [MATCH] FOUND END TOKEN IN STREAM")

                    # 1. Strip the token so downstream TTS/transcript doesn't see it
                    try:
                        if hasattr(chunk, 'choices') and len(chunk.choices) > 0:
                            new_content = re.sub(r"\[\[\s*END[_ ]?INTERVIEW\s*\]\]", "", content, flags=re.IGNORECASE)
                            chunk.choices[0].delta.content = new_content
                            print(f"DEBUG: [LLM_STRIP] chunk content cleaned to '{(new_content or '')[:160]}'")
                    except Exception as e:
                        print(f"❌ [STRIP_ERR] {e}")

                    # 2. Trigger evaluation and close immediately (synchronous within this turn)
                    try:
                        print(f"DEBUG: [SHUTDOWN] Sending immediate signal for {self.session_id}")
                        await self.immediate_signal_and_db()
                    except Exception as e:
                        print(f"❌ [IMMEDIATE_SIGNAL_ERR] {e}")
            except Exception as e:
                print(f"❌ [LLM_NODE_ERROR] {e}")
            yield chunk

    async def immediate_signal_and_db(self):
        """Generate REAL LLM evaluation before signaling end."""
        try:
            print(f"🤖 [EVAL_START] Generating real evaluation for {self.session_id}")

            # 1. BUILD CONTEXT FOR EVALUATION (use session.chat_ctx)
            eval_context = []
            session = getattr(self, '_session', None)
            print(f"🔍 [EVAL_DEBUG] Session available: {session is not None}")

            if session and getattr(session, 'chat_ctx', None) and getattr(session.chat_ctx, 'messages', None):
                for msg in session.chat_ctx.messages[-20:]:
                    try:
                        if getattr(msg, 'role', None) in ['user', 'assistant'] and getattr(msg, 'content', None):
                            content = str(getattr(msg, 'content', '')).strip()
                            if content and not content.startswith('CANDIDATE CODE'):
                                role = 'Candidate' if getattr(msg, 'role') == 'user' else 'Interviewer'
                                eval_context.append(f"{role}: {content}")
                    except Exception:
                        continue

            # Add final code if present
            try:
                if getattr(self, 'current_code', '') and str(self.current_code).strip():
                    eval_context.append(f"\nFINAL CODE:\n{self.current_code}")
            except Exception:
                pass

            context_str = "\n\n".join(eval_context[-15:])
            print(f"📚 [CONTEXT] {len(eval_context)} messages → {len(context_str)} chars")

            # 2. LLM EVALUATION PROMPT
            eval_prompt = f"""# EVALUATION TASK
Review this coding interview and generate structured feedback:

CONTEXT:
{context_str}

Generate JSON evaluation with:
{{"strengths": ["bullet 1", "bullet 2"], 
  "improvements": ["bullet 1", "bullet 2"], 
  "edgeCases": ["case 1", "case 2"], 
  "nextSteps": ["action 1", "action 2"],
  "overallScore": "A/B/C/D/F",
  "technicalLevel": "Junior/Mid/Senior"}}

Be specific about code quality, problem-solving, communication.
Keep each bullet 1 sentence max."""

            # 3. CALL GROQ SDK FOR EVALUATION (sync client run in executor)
            try:
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None,
                    lambda: Groq(api_key=os.getenv("GROQ_API_KEY")).chat.completions.create(
                        model="llama-3.1-8b-instant",
                        messages=[{"role": "user", "content": eval_prompt}],
                        temperature=0.3,
                        max_tokens=800
                    )
                )
                try:
                    eval_raw = response.choices[0].message.content.strip()
                except Exception:
                    eval_raw = str(response).strip()
                print(f"📊 [LLM_EVAL_RAW] {eval_raw[:300]}...")
            except Exception as e:
                print(f"❌ [GROQ_ERROR] {e}")
                eval_raw = ""

            # 4. PARSE JSON EVALUATION
            try:
                json_match = re.search(r'\{.*\}', eval_raw, re.DOTALL)
                if json_match:
                    eval_json_str = json_match.group()
                    evaluation = json.loads(eval_json_str)
                else:
                    evaluation = json.loads(eval_raw)
            except Exception as e:
                print(f"⚠️ [EVAL_PARSE_FAIL] {e}, using fallback")
                evaluation = {
                    "strengths": ["Evaluation generation failed - review manually"],
                    "improvements": [],
                    "edgeCases": [],
                    "nextSteps": ["Follow up with candidate"],
                    "overallScore": "TBD",
                    "technicalLevel": "Unknown"
                }

            print(f"✅ [REAL_EVAL_GENERATED]")
            print(f"   Strengths: {evaluation.get('strengths', [])}")
            print(f"   Score: {evaluation.get('overallScore', 'N/A')}")
            print(f"   Level: {evaluation.get('technicalLevel', 'N/A')}")

            # 5. COLLECT TRANSCRIPTS FROM MONGO
            schema_transcripts = []
            try:
                doc = sessions_collection.find_one({'sessionId': self.session_id})
                if doc and isinstance(doc.get('transcripts'), list):
                    for t in doc.get('transcripts', []):
                        role_raw = t.get('role') if isinstance(t, dict) else None
                        role = 'user' if role_raw == 'user' else 'assistant'
                        content = (t.get('content') if isinstance(t, dict) else str(t)) or ''
                        content = content.strip()
                        if content:
                            schema_transcripts.append({
                                'role': role,
                                'content': content,
                                'timestamp': t.get('timestamp') if isinstance(t, dict) and t.get('timestamp') else None
                            })
            except Exception as e:
                print(f"⚠️ [TRANSCRIPTS_READ_ERR] {e}")

            # 6. POST TO BACKEND WITH REAL EVALUATION
            backend_url = os.getenv('BACKEND_URL', 'http://localhost:5000')
            eval_endpoint = f"{backend_url}/api/sessions/{self.session_id}/evaluation"

            payload = {
                'status': 'evaluated',
                'endedAt': datetime.datetime.utcnow().isoformat(),
                'finalCode': self.current_code or '',
                'transcripts': schema_transcripts,
                'evaluation': {
                    **evaluation,
                    'generatedAt': datetime.datetime.utcnow().isoformat()
                }
            }

            async with aiohttp.ClientSession() as session:
                try:
                    print(f"📡 [HTTP_POST] Sending REAL evaluation to {eval_endpoint}")
                    resp = await session.put(eval_endpoint, json=payload, timeout=10)
                    text = await resp.text()
                    if resp.status in (200, 201):
                        print(f"✅ [BACKEND_ACCEPTED] Real evaluation saved!")
                    else:
                        print(f"❌ [BACKEND_ERROR] {resp.status}: {text}")
                except Exception as e:
                    print(f"❌ [HTTP_FAIL] {e}")

            # 7. CONTINUE WITH SIGNAL + CLEANUP
            try:
                await self._send_end_signal()
            except Exception:
                pass
            try:
                self._end_signal_event.set()
            except Exception:
                pass
            try:
                asyncio.create_task(self._delayed_disconnect())
            except Exception:
                pass

        except Exception as e:
            print(f"❌ [REAL_EVAL_FATAL] {e}")
            # Fallback to old placeholder logic
            try:
                await self._send_end_signal()
            except Exception:
                pass

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
                await loop.run_in_executor(None, lambda: sessions_collection.update_one(
                    {"sessionId": self.session_id},
                    {"$set": {
                        "status": "completed",
                        "finalCode": self.current_code,
                        "evaluation": eval_placeholder,
                        "completedAt": True
                    }}
                ))
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
    candidate = await ctx.wait_for_participant()
    print(f"🚀 Candidate connected: {candidate.identity}")
    # Expose the current room to the log-forwarding handler
    try:
        global CURRENT_ROOM
        CURRENT_ROOM = ctx.room
        print(f"🔗 [CURRENT_ROOM_SET] {getattr(ctx.room, 'name', 'unknown')}")
    except Exception as e:
        print(f"❌ [CURRENT_ROOM_SET_ERROR] {e}")

    # Track active tasks for the stream handler
    _active_tasks = set()

    loop = asyncio.get_event_loop()
    try:
        session_id = ctx.room.name
        if ctx.room.metadata:
            metadata = json.loads(ctx.room.metadata)
            session_id = metadata.get("sessionId", session_id)

        session_data = await loop.run_in_executor(
            None, lambda: sessions_collection.find_one({"sessionId": session_id})
        )
        question = session_data.get("questionsAsked", ["Tell me about yourself"])[0] if session_data else "Hello!"
    except Exception as e:
        print(f"⚠️ DB Error: {e}")
        question = "Tell me about yourself."

    assistant = InterviewAssistant(question, ctx.room, session_id=session_id)
    # Session will be created next; attach it to the assistant after creation so it's defined

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model="nova-2"),
        llm=groq.LLM(model="llama-3.1-8b-instant"),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            model="eleven_multilingual_v2",
            voice_id=os.getenv("ELEVENLABS_VOICE_ID")
        )
    )

    # Keep a reference to the session on the assistant so hidden evaluation can access chat_ctx
    assistant._session = session

    # --- TEXT STREAM HANDLER (Replaces data_received) ---
    
    async def handle_code_stream(reader: rtc.TextStreamReader, participant_identity: str):
        """Process the incoming code stream exactly like audio STT."""
        try:
            # Wait for the complete code text from the stream
            code_content = await reader.read_all()
            
            if code_content:
                # 1. Update the brain context
                assistant.update_code_context(code_content, session.chat_ctx)
                
                # 2. Trigger the LLM to generate a reply (mimics speech committed)
                asyncio.create_task(session.generate_reply())
                
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
        instructions="Say exactly: 'Hi, I'm Chris, I'll be your interviewer today, Are you ready to begin?'"
    )

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)



