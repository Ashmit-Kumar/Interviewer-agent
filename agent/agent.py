import asyncio
import os
import json
import logging
import pymongo
from typing import AsyncIterable
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import JobContext, Agent, AgentSession, AgentServer, llm, tokenize
from livekit.plugins import silero, groq, deepgram, elevenlabs
import time


load_dotenv()
logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO)
mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["interview-platform"]
sessions_collection = db["sessions"]    

# Global reference to the current LiveKit room for log-based forwarding
CURRENT_ROOM = None
# Global refs to allow log-forwarder to trigger shutdown when needed
CURRENT_SESSION = None
CURRENT_CTX = None


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

                # Detect exit phrases in SDK logs and trigger a shutdown if seen
                try:
                    t = text.lower()
                    exit_phrases = ["exit", "end interview", "end", "goodbye", "done", "thank you"]
                    if any(p in t for p in exit_phrases):
                        print('🛑 [LOG_FORWARD] Exit phrase detected in SDK log')
                        loop2 = None
                        try:
                            loop2 = asyncio.get_event_loop()
                        except RuntimeError:
                            pass

                        async def _maybe_shutdown():
                            if CURRENT_CTX is None or CURRENT_SESSION is None:
                                print('⚠️ [LOG_FORWARD] No CURRENT_SESSION/CTX set, cannot shutdown')
                                return
                            try:
                                await shutdown_session(CURRENT_CTX, CURRENT_SESSION)
                            except Exception as se:
                                print(f'❌ [LOG_SHUTDOWN_FAILED] {se}')

                        if loop2 and loop2.is_running():
                            loop2.call_soon_threadsafe(lambda: asyncio.create_task(_maybe_shutdown()))
                        else:
                            try:
                                asyncio.run(_maybe_shutdown())
                            except Exception:
                                pass
                except Exception:
                    pass

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
    def __init__(self, question: str, room=None):
        question = question.replace('.', ',')
        self._room = room
        self.current_code = ""
        super().__init__(
            instructions=f"""# Role
                You are Chris, a professional Technical Interviewer conducting a collaborative coding interview.

                # Context
                Problem assigned: {question}

                # How to handle the Code Editor
                - You will receive "CANDIDATE CODE UPDATE" messages in your context history.
                - **Rule**: Whenever you see a new code block, analyze it silently. 
                - **Rule**: Only speak if the candidate asks a question, or if they have finished a significant logic block and seem stuck.
                - **Rule**: Do not comment on every character. 

                # Voice Output & Formatting
                - **NO Full Stops**: Use commas, question marks, or exclamation marks.
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
                if text.strip():
                    full_text += text
                yield text

            if full_text.strip() and self._room:
                try:
                    transcript_data = json.dumps({
                        "type": "transcript",
                        "role": "assistant",
                        "content": full_text.strip()
                    })
                    await self._room.local_participant.publish_data(
                        transcript_data.encode('utf-8'),
                        reliable=True
                    )
                except Exception as e:
                    print(f"❌ Failed to send transcript: {e}")

        return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)

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

    assistant = InterviewAssistant(question, ctx.room)

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model="nova-2"),
        llm=groq.LLM(model="llama-3.1-8b-instant"),
        tts=elevenlabs.TTS(
            api_key=os.getenv("ELEVENLABS_API_KEY"),
            model="eleven_multilingual_v2",
            voice_id=os.getenv("ELEVENLABS_VOICE_ID")
        ),
    )

    # expose session and ctx for log-forwarder based shutdown hooks
    try:
        global CURRENT_SESSION, CURRENT_CTX
        CURRENT_SESSION = session
        CURRENT_CTX = ctx
        print('🔗 [CURRENT_SESSION_SET] session and ctx exposed for log forwarder')
    except Exception as e:
        print(f'❌ [CURRENT_SESSION_SET_ERROR] {e}')
    # )

    # Shared state for final code capture
    final_code_holder = {"code": ""}
    chat_history = []

    # --- TEXT STREAM HANDLER (Replaces data_received) ---
    
    async def handle_code_stream(reader: rtc.TextStreamReader, participant_identity: str):
        """Process the incoming code stream exactly like audio STT."""
        try:
            # Wait for the complete code text from the stream
            code_content = await reader.read_all()
            
            if code_content:
                # 1. Update the brain context and capture final code
                final_code_holder['code'] = code_content
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
        """Broadcast the user's transcript and detect exit phrases to shut down the session."""
        try:
            if not msg or not getattr(msg, 'content', None):
                return
            text = str(msg.content).strip()
            if not text:
                return

            print(f"🎤 USER: {text}")
            # Append to chat history for later evaluation
            try:
                chat_history.append({"role": "user", "content": text, "timestamp": time.time()})
            except Exception:
                pass

            payload = json.dumps({
                "type": "transcript",
                "role": "user",
                "content": text
            })

            async def broadcast_transcript():
                try:
                    await ctx.room.local_participant.publish_data(
                        payload.encode('utf-8'),
                        reliable=True
                    )
                    print("✅ [BROADCAST_SUCCESS] User transcript sent to frontend")
                except Exception as e:
                    print(f"❌ [BROADCAST_ERROR] {e}")

            asyncio.create_task(broadcast_transcript())

            # Exit detection - simple event-driven shutdown
            t = text.lower()
            exit_phrases = ["exit", "end", "goodbye", "done", "end interview", "thank you"]
            if any(phrase in t for phrase in exit_phrases):
                print("� EXIT DETECTED - Ending session")
                # Say goodbye (non-blocking)
                asyncio.create_task(session.generate_reply(
                    instructions="Say exactly: 'Great work today, generating your results now, Thank you and goodbye!'"
                ))
                # Shutdown after goodbye finishes
                asyncio.create_task(shutdown_session(ctx, session))
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

    # Let event handlers manage shutdown; keep the session alive
    print("🎤 Session running - say 'end interview' to exit")
    await asyncio.Future()

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)


async def handle_exit(session: AgentSession, session_id: str, final_code: str, chat_history: list, ctx: JobContext):
    """Save session + trigger LLM evaluation, then close session and disconnect"""
    try:
        print(f"🛑 [HANDLE_EXIT] Saving session {session_id}")
        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: sessions_collection.update_one(
                {"sessionId": session_id},
                {
                    "$set": {
                        "finalCode": final_code,
                        "chatHistory": chat_history,
                        "status": "completed",
                        "endedAt": time.time()
                    }
                },
                upsert=True
            )
        )

        # Trigger async evaluation
        asyncio.create_task(evaluate_session(session_id))

        # Allow goodbye TTS to finish
        await asyncio.sleep(2)

        try:
            await session.aclose()
        except Exception as e:
            print(f"❌ [SESSION_CLOSE_ERROR] {e}")

        try:
            await ctx.disconnect()
        except Exception as e:
            print(f"❌ [CTX_DISCONNECT_ERROR] {e}")

        print(f"✅ [HANDLE_EXIT_COMPLETE] {session_id}")
    except Exception as e:
        print(f"❌ [EXIT_ERROR] {e}")


async def shutdown_session(ctx: JobContext, session: AgentSession):
    """Clean shutdown - saves session + disconnects"""
    try:
        # Allow goodbye TTS to finish
        await asyncio.sleep(3)

        # Save minimal session state to MongoDB
        try:
            session_id = ctx.room.name
            sessions_collection.update_one(
                {"sessionId": session_id},
                {"$set": {
                    "status": "completed",
                    "endedAt": time.time()
                }}
            )
            print(f"💾 Session {session_id} saved")
        except Exception as e:
            print(f"⚠️ Save failed: {e}")

        # Notify frontend that the interview ended
        try:
            action_payload = json.dumps({"type": "action", "action": "END_INTERVIEW"})
            try:
                await ctx.room.local_participant.publish_data(action_payload.encode('utf-8'), reliable=True)
                print("📣 [ACTION_SENT] END_INTERVIEW published to room")
            except Exception as e:
                # fallback to global room if available
                try:
                    if CURRENT_ROOM is not None:
                        await CURRENT_ROOM.local_participant.publish_data(action_payload.encode('utf-8'), reliable=True)
                        print("📣 [ACTION_SENT] END_INTERVIEW published via CURRENT_ROOM")
                except Exception as e2:
                    print(f"❌ [ACTION_SEND_FAILED] {e} / {e2}")
        except Exception:
            pass

        # Run evaluation now (wait) so we can publish results while the room is still connected
        try:
            print("🔎 [EVALUATION] running evaluation before disconnect")
            await evaluate_session(session_id)
            print("🔎 [EVALUATION] completed and published (if possible)")
        except Exception as e:
            print(f"❌ [EVAL_FAILED] {e}")

        # Give frontend a moment to receive evaluation/action packets
        try:
            await asyncio.sleep(1.0)
        except Exception:
            pass

        # Clean disconnect (close session). Do not call ctx.disconnect() directly if unavailable
        try:
            await session.aclose()
        except Exception as e:
            print(f"❌ [SESSION_CLOSE_ERROR] {e}")

        # Attempt to disconnect room if possible
        try:
            if hasattr(ctx, 'disconnect'):
                await ctx.disconnect()
            elif hasattr(ctx, 'room') and hasattr(ctx.room, 'disconnect'):
                await ctx.room.disconnect()
        except Exception as e:
            print(f"❌ [CTX_DISCONNECT_ERROR] {e}")

        print("✅ Session ended cleanly")
    except Exception as e:
        print(f"❌ [SHUTDOWN_ERROR] {e}")


async def evaluate_session(session_id: str):
    try:
        session_data = sessions_collection.find_one({"sessionId": session_id})
        if not session_data:
            print(f"❌ [EVALUATE_MISSING] {session_id}")
            return

        evaluation_prompt = f"""
        Analyze this coding interview:

        Question: {session_data.get('questionsAsked', ['N/A'])[0]}
        Final Code: {session_data.get('finalCode', '')[:4000]}
        Transcript: {json.dumps(session_data.get('chatHistory', []))}

        Return JSON:
        {{
            "strengths": ["list", "of", "positives"],
            "improvements": ["list", "of", "improvements"],
            "edgeCases": ["missing", "cases"],
            "nextSteps": ["preparation", "tips"]
        }}
        """

        llm_client = groq.LLM(model="llama-3.1-8b-instant")
        response = await llm_client.chat(evaluation_prompt)

        # Try to parse response content as JSON
        try:
            eval_json = json.loads(response.content)
        except Exception:
            eval_json = {"raw": response.content}

        sessions_collection.update_one(
            {"sessionId": session_id},
            {"$set": {"evaluation": eval_json, "status": "evaluated"}}
        )
        print(f"✅ [EVALUATION_COMPLETE] {session_id}")
    except Exception as e:
        print(f"❌ [EVALUATION_ERROR] {e}")
    # Try to publish evaluation back to the room if available
    try:
        payload = json.dumps({"type": "evaluation", "sessionId": session_id, "evaluation": eval_json})
        if CURRENT_ROOM is not None:
            try:
                await CURRENT_ROOM.local_participant.publish_data(payload.encode('utf-8'), reliable=True)
                print("📡 [EVALUATION_PUBLISHED] sent evaluation to room")
            except Exception as e:
                print(f"❌ [EVAL_PUBLISH_FAILED] {e}")
    except Exception:
        pass



