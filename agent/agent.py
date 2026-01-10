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

load_dotenv()
logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO)
mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["interview-platform"]
sessions_collection = db["sessions"]    

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
        )
    )

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
        print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    await session.start(room=ctx.room, agent=assistant)
    
    # Initial Greeting
    await session.generate_reply(
        instructions="Say exactly: 'Hi, I'm Chris, I'll be your interviewer today, Are you ready to begin?'"
    )

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)




# import asyncio
# import os
# import json
# import logging
# import pymongo
# from typing import AsyncIterable
# from dotenv import load_dotenv
# from livekit import rtc
# from livekit.agents import JobContext, Agent, AgentSession, AgentServer, llm, tokenize
# from livekit.plugins import silero, groq, deepgram, elevenlabs

# load_dotenv()
# logging.getLogger('pymongo').setLevel(logging.WARNING)
# logging.getLogger('livekit').setLevel(logging.INFO)
# mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
# db = mongo_client["interview-platform"]
# sessions_collection = db["sessions"]


# class InterviewAssistant(Agent):
#     def __init__(self, question: str, room=None):
#         # Replace fullstops with commas in the question
#         question = question.replace('.', ',')
#         self._room = room
#         self.current_code = ""  # Track current code from editor
#         super().__init__(
#             instructions=f"""# Role
#                 You are Chris, a professional Technical Interviewer conducting a collaborative coding interview.

#                 # Context
#                 Problem assigned: {question}

#                 # How to handle the Code Editor
#                 - You will receive "CANDIDATE CODE IN EDITOR" blocks in your context history.
#                 - **Rule**: Whenever you see a new code block, analyze it silently. 
#                 - **Rule**: If the candidate asks "What do you think?" or "Is this right?", reference the logic in that code block.
#                 - **Rule**: Do not comment on every character. Wait for them to finish a logic block or ask you a question.
#                 - **Rule**: If they write something simple like 'a + b', do not say they started a loop. Only talk about what is actually there.

#                 # Interview Flow
#                 1. GREETING: Welcome them and ask if they are ready.
#                 2. THE CHALLENGE: Once ready, explain the problem '{question}' clearly.
#                 3. GUIDANCE: Monitor the code. Provide hints only if they struggle.
#                 4. DEEP DIVE: Ask about Big O complexity once finished.

#                 # Voice Output & Formatting (CRITICAL)
#                 - **NO Full Stops**: NEVER use periods (.) at the end of sentences. Use commas, question marks, or exclamation marks for a natural voice flow.
#                 - **Plain Text Only**: No markdown, asterisks, or backticks.
#                 - **Brevity**: Keep replies to 1-3 sentences maximum.
#                 - **No Syntax**: Don't say "int i equals zero", say "I see you're initializing your counter".
#                 - **Avoid Filler**: No "um", "uh", or "like".
#                 - **Encouragement**: Stay positive and professional throughout the session.
#                 """
#         )

#     def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
#         """Injects code into the actual LLM chat context history"""
#         self.current_code = code
#         code_message = llm.ChatMessage(
#             role="user", 
#             content=f"CANDIDATE CODE UPDATE:\n{code}"
#         )
#         chat_ctx.messages.append(code_message)
#         print(f"📥 [CONTEXT_SYNC] Code appended to timeline")
#         # Label it clearly so Chris knows what he is looking at
#         code_message = f"CANDIDATE CODE IN EDITOR:\n{code}"
        
#         # We look for an existing code block in history and update it 
#         # to avoid flooding the brain with 1000 messages
#         found = False
#         for msg in chat_ctx.messages:
#             if msg.role == "system" and "CANDIDATE CODE IN EDITOR:" in msg.content:
#                 msg.content = code_message
#                 found = True
#                 break

#         if not found:
#             chat_ctx.messages.append(llm.ChatMessage(role="system", content=code_message))

#         print(f"📥 [CONTEXT_SYNC] LLM memory updated with latest code")

#     async def tts_node(self, text_stream, model_settings):
#         print("DEBUG: TTS Node starting...")

#         async def monitor_text(stream):
#             full_text = ""
#             async for text in stream:
#                 if text.strip():
#                     print(f"🎙️ SENDING TO TTS: {text}")
#                     full_text += text
#                 yield text

#             if full_text.strip():
#                 print(f"🛰️ COMPLETE TRANSCRIPT: {full_text}")
#                 try:
#                     if self._room:
#                         transcript_data = json.dumps({
#                             "type": "transcript",
#                             "role": "assistant",
#                             "content": full_text.strip()
#                         })
#                         await self._room.local_participant.publish_data(
#                             transcript_data.encode('utf-8'),
#                             reliable=True
#                         )
#                         print("✅ Transcript sent to frontend")
#                 except Exception as e:
#                     print(f"❌ Failed to send transcript: {e}")

#         return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)


# server = AgentServer()


# @server.rtc_session()
# async def entrypoint(ctx: JobContext):
#     await ctx.connect()
#     candidate = await ctx.wait_for_participant()
#     print(f"🚀 Candidate connected: {candidate.identity}")

#     loop = asyncio.get_event_loop()
#     try:
#         session_id = ctx.room.name
#         if ctx.room.metadata:
#             try:
#                 metadata = json.loads(ctx.room.metadata)
#                 session_id = metadata.get("sessionId", session_id)
#             except:
#                 pass

#         session_data = await loop.run_in_executor(
#             None,
#             sessions_collection.find_one,
#             {"sessionId": session_id}
#         )
#         question = session_data.get("questionsAsked", ["Tell me about yourself"])[0] if session_data else "Hello!"
#     except Exception as e:
#         print(f"⚠️ DB Error: {e}")
#         question = "Tell me about yourself."

#     assistant = InterviewAssistant(question, ctx.room)

#     session = AgentSession(
#         vad=silero.VAD.load(),
#         stt=deepgram.STT(model="nova-2"),
#         llm=groq.LLM(model="llama-3.1-8b-instant"),
#         tts=elevenlabs.TTS(
#             api_key=os.getenv("ELEVENLABS_API_KEY"),
#             model="eleven_multilingual_v2",
#             voice_id=os.getenv("ELEVENLABS_VOICE_ID")
#         )
#     )

#     # @ctx.room.on("data_received")
#     @ctx.room.on("data_received")
#     def on_data_received(data: rtc.DataPacket):
#         try:
#             payload = json.loads(data.data.decode('utf-8'))
#             if payload.get("type") == "code_update":
#                 code_content = payload.get("content", "")
                
#                 # 1. Update the context (Pass the session's chat context)
#                 assistant.update_code_context(code_content, session.chat_ctx)
                
#                 # 2. TRIGGER THE LLM (This mimics the 'user finished speaking' event)
#                 # This makes Chris 'notice' the code and decide if he should speak
#                 asyncio.create_task(session.generate_reply())
                
#                 print("📥 [DATA_RECEIVED] Code update triggered LLM reply")
#         except Exception as e:
#             print(f"⚠️ [DATA_ERROR] Error: {e}")

#     @session.on("agent_state_changed")
#     def on_state_change(ev):
#         print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

#     @session.on("user_speech_committed")
#     def on_user_speech(msg: llm.ChatMessage):
#         if msg.content:
#             print(f"🎤 USER TRANSCRIPT: {msg.content}")

#     @session.on("agent_speech_committed")
#     def on_agent_speech(msg: llm.ChatMessage):
#         print(f"🛰️ AGENT FINAL TEXT: {msg.content}")

#     await session.start(room=ctx.room, agent=assistant)
#     await session.generate_reply(
#         instructions="Say exactly: 'Hi, I'm Chris, I'll be your interviewer today,  Are you ready to begin?'"
#     )

#     while True:
#         await asyncio.sleep(1)


# if __name__ == "__main__":
#     from livekit.agents import cli
#     cli.run_app(server)



    # import asyncio
    # import os
    # import json
    # import logging
    # import pymongo
    # from typing import AsyncIterable
    # from dotenv import load_dotenv
    # from livekit import rtc
    # from livekit.agents import JobContext, Agent, AgentSession, AgentServer, llm, tokenize
    # from livekit.plugins import silero, groq, deepgram, elevenlabs

    # load_dotenv()
    # logging.getLogger('pymongo').setLevel(logging.WARNING)
    # logging.getLogger('livekit').setLevel(logging.INFO)
    # mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
    # db = mongo_client["interview-platform"]
    # sessions_collection = db["sessions"]


    # class InterviewAssistant(Agent):
    #     def __init__(self, question: str, room=None):
    #         # Replace fullstops with commas in the question
    #         question = question.replace('.', ',')
    #         self._room = room
    #         self.current_code = ""  # Track current code from editor
    #         super().__init__(
    #             instructions=f"""# Role
    #                 You are Chris, a professional Technical Interviewer conducting a collaborative coding interview.

    #                 # Context
    #                 Problem assigned: {question}

    #                 # How to handle the Code Editor
    #                 - You will receive "CANDIDATE CODE IN EDITOR" blocks in your context history.
    #                 - **Rule**: Whenever you see a new code block, analyze it silently. 
    #                 - **Rule**: If the candidate asks "What do you think?" or "Is this right?", reference the logic in that code block.
    #                 - **Rule**: Do not comment on every character. Wait for them to finish a logic block or ask you a question.
    #                 - **Rule**: If they write something simple like 'a + b', do not say they started a loop. Only talk about what is actually there.

    #                 # Interview Flow
    #                 1. GREETING: Welcome them and ask if they are ready.
    #                 2. THE CHALLENGE: Once ready, explain the problem '{question}' clearly.
    #                 3. GUIDANCE: Monitor the code. Provide hints only if they struggle.
    #                 4. DEEP DIVE: Ask about Big O complexity once finished.

    #                 # Voice Output & Formatting (CRITICAL)
    #                 - **NO Full Stops**: NEVER use periods (.) at the end of sentences. Use commas, question marks, or exclamation marks for a natural voice flow.
    #                 - **Plain Text Only**: No markdown, asterisks, or backticks.
    #                 - **Brevity**: Keep replies to 1-3 sentences maximum.
    #                 - **No Syntax**: Don't say "int i equals zero", say "I see you're initializing your counter".
    #                 - **Avoid Filler**: No "um", "uh", or "like".
    #                 - **Encouragement**: Stay positive and professional throughout the session.
    #                 """
    #         )
    #     def update_code_context(self, code: str, chat_ctx: llm.ChatContext):
    #         """Injects code into the actual LLM chat context history"""
    #         self.current_code = code
            
    #         # Label it clearly so Chris knows what he is looking at
    #         code_message = f"CANDIDATE CODE IN EDITOR:\n{code}"
            
    #         # We look for an existing code block in history and update it 
    #         # to avoid flooding the brain with 1000 messages
    #         found = False
    #         for msg in chat_ctx.messages:
    #             if msg.role == "system" and "CANDIDATE CODE IN EDITOR:" in msg.content:
    #                 msg.content = code_message
    #                 found = True
    #                 break
            
    #         if not found:
    #             chat_ctx.messages.append(llm.ChatMessage(role="system", content=code_message))
            
    #         print(f"📥 [CONTEXT_SYNC] LLM memory updated with latest code")
    #     # def update_code_context(self, code: str):
    #     #     """Update the agent's knowledge of the candidate's current code"""
    #     #     self.current_code = code
    #     #     print(f"💻 [CODE_UPDATE] Agent is now aware of {len(code)} characters of code")

    #     # FIXED: Corrected property access for ChatChunk
    #     # async def llm_node(self, chat_ctx, tools, model_settings):
    #     #     print(f"DEBUG: LLM Node starting...")
    #     #     actual_stream = await Agent.default.llm_node(self, chat_ctx, tools, model_settings)
    #     #     async def monitor_chunks(stream):
    #     #         full_text = ""
    #     #         async for chunk in stream:
    #     #             # 1. Use the unified content property if available
    #     #             # 2. Check for choices/delta safely
    #     #             content = ""
    #     #             try:
    #     #                 if hasattr(chunk, 'choices') and chunk.choices:
    #     #                     content = chunk.choices[0].delta.content or ""
    #     #                 elif hasattr(chunk, 'delta') and chunk.delta:
    #     #                     content = chunk.delta.content or ""
    #     #             except Exception:
    #     #                 pass
    #     #             if content:
    #     #                 full_text += content
    #     #             yield chunk
    #     #         if full_text:
    #     #             print(f"🤖 GROQ RESPONDED: {full_text}")
    #     #     return monitor_chunks(actual_stream)

    #     async def tts_node(self, text_stream, model_settings):
    #         print("DEBUG: TTS Node starting...")
    #         async def monitor_text(stream):
    #             full_text = ""
    #             async for text in stream:
    #                 if text.strip():
    #                     print(f"🎙️ SENDING TO TTS: {text}")
    #                     full_text += text
    #                 yield text
    #             # Send complete transcript to frontend when done
    #             if full_text.strip():
    #                 print(f"🛰️ COMPLETE TRANSCRIPT: {full_text}")
    #                 try:
    #                     # Use the room passed during initialization
    #                     if self._room:
    #                         transcript_data = json.dumps({
    #                             "type": "transcript",
    #                             "role": "assistant",
    #                             "content": full_text.strip()
    #                         })
    #                         await self._room.local_participant.publish_data(
    #                             transcript_data.encode('utf-8'),
    #                             reliable=True
    #                         )
    #                         print("✅ Transcript sent to frontend")
    #                 except Exception as e:
    #                     print(f"❌ Failed to send transcript: {e}")
    #         return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)


    # server = AgentServer()


    # @server.rtc_session()
    # async def entrypoint(ctx: JobContext):
    #     await ctx.connect()
    #     candidate = await ctx.wait_for_participant()
    #     print(f"🚀 Candidate connected: {candidate.identity}")
    #     loop = asyncio.get_event_loop()
    #     try:
    #         session_id = ctx.room.name
    #         if ctx.room.metadata:
    #             try:
    #                 metadata = json.loads(ctx.room.metadata)
    #                 session_id = metadata.get("sessionId", session_id)
    #             except:
    #                 pass
    #         session_data = await loop.run_in_executor(None, sessions_collection.find_one, {"sessionId": session_id})
    #         question = session_data.get("questionsAsked", ["Tell me about yourself"])[0] if session_data else "Hello!"
    #     except Exception as e:
    #         print(f"⚠️ DB Error: {e}")
    #         question = "Tell me about yourself."
    #     assistant = InterviewAssistant(question, ctx.room)
    #     session = AgentSession(
    #         vad=silero.VAD.load(),
    #         stt=deepgram.STT(model="nova-2"),
    #         llm=groq.LLM(model="llama-3.1-8b-instant"),
    #         tts=elevenlabs.TTS(
    #             api_key=os.getenv("ELEVENLABS_API_KEY"),
    #             model="eleven_multilingual_v2",
    #             voice_id=os.getenv("ELEVENLABS_VOICE_ID")
    #         )
    #     )
    #     # NEW: Data Channel Listener for code updates from frontend
    #     @ctx.room.on("data_received")
    #     def on_data_received(data: rtc.DataPacket):
    #         try:
    #             payload = json.loads(data.data.decode('utf-8'))
    #             if payload.get("type") == "code_update":
    #                 code_content = payload.get("content", "")
    #                 assistant.update_code_context(code_content)
    #                 print(f"📥 [DATA_RECEIVED] Code packet received from candidate")
    #         except Exception as e:
    #             print(f"⚠️ [DATA_ERROR] Error processing code data: {e}")
    #     # 1. State changes
    #     @session.on("agent_state_changed")
    #     def on_state_change(ev):
    #         print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")
    #     # 2. Incoming transcripts (User Speech)
    #     @session.on("user_speech_committed")
    #     def on_user_speech(msg: llm.ChatMessage):
    #         if msg.content:
    #             print(f"🎤 USER TRANSCRIPT: {msg.content}")
    #     # 3. Finalized agent messages (Before TTS)
    #     @session.on("agent_speech_committed")
    #     def on_agent_speech(msg: llm.ChatMessage):
    #         print(f"🛰️ AGENT FINAL TEXT: {msg.content}")
    #     await session.start(room=ctx.room, agent=assistant)
    #     await session.generate_reply(instructions=f"Say exactly: 'Hi, I'm Chris, I'll be your interviewer today,  Are you ready to begin?'")
    #     while True:
    #         await asyncio.sleep(1)


    # if __name__ == "__main__":
    #     from livekit.agents import cli
    #     cli.run_app(server)

