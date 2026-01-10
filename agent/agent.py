
# Most stable working version as of 2024-06-06
   


import asyncio
import os
import json
import logging
import pymongo
from typing import AsyncIterable
from dotenv import load_dotenv

from livekit.agents import JobContext, Agent, AgentSession, AgentServer, llm
from livekit.plugins import silero, groq, deepgram, elevenlabs

load_dotenv()

logging.getLogger('pymongo').setLevel(logging.WARNING)
logging.getLogger('livekit').setLevel(logging.INFO)

mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["interview-platform"]
sessions_collection = db["sessions"]

class InterviewAssistant(Agent):
    def __init__(self, question: str):
        super().__init__(
            instructions=f"You are a professional interviewer. Current question: {question}. Speak 1-2 sentences only."
        )

    # FIXED: Corrected property access for ChatChunk
    # async def llm_node(self, chat_ctx, tools, model_settings):
    #     print(f"DEBUG: LLM Node starting...")
        
    #     actual_stream = await Agent.default.llm_node(self, chat_ctx, tools, model_settings)
        
    #     async def monitor_chunks(stream):
    #         full_text = ""
    #         async for chunk in stream:
    #             # 1. Use the unified content property if available
    #             # 2. Check for choices/delta safely
    #             content = ""
    #             try:
    #                 if hasattr(chunk, 'choices') and chunk.choices:
    #                     content = chunk.choices[0].delta.content or ""
    #                 elif hasattr(chunk, 'delta') and chunk.delta:
    #                     content = chunk.delta.content or ""
    #             except Exception:
    #                 pass
                
    #             if content:
    #                 full_text += content
                
    #             yield chunk
            
    #         if full_text:
    #             print(f"🤖 GROQ RESPONDED: {full_text}")
            
    #     return monitor_chunks(actual_stream)

    async def tts_node(self, text_stream, model_settings):
        print("DEBUG: TTS Node starting...")
        
        async def monitor_text(stream):
            async for text in stream:
                if text.strip():
                    print(f"🎙️ SENDING TO TTS: {text}")
                yield text
        
        return Agent.default.tts_node(self, monitor_text(text_stream), model_settings)

server = AgentServer()

@server.rtc_session()
async def entrypoint(ctx: JobContext):
    await ctx.connect()
    
    candidate = await ctx.wait_for_participant()
    print(f"🚀 Candidate connected: {candidate.identity}")

    loop = asyncio.get_event_loop()
    try:
        session_id = ctx.room.name
        if ctx.room.metadata:
            try:
                metadata = json.loads(ctx.room.metadata)
                session_id = metadata.get("sessionId", session_id)
            except: pass
            
        session_data = await loop.run_in_executor(None, sessions_collection.find_one, {"sessionId": session_id})
        question = session_data.get("questionsAsked", ["Tell me about yourself"])[0] if session_data else "Hello!"
    except Exception as e:
        print(f"⚠️ DB Error: {e}")
        question = "Tell me about yourself."

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
    # 1. State changes
    @session.on("agent_state_changed")
    def on_state_change(ev):
        print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    # 2. Incoming transcripts (User Speech)
    @session.on("user_speech_committed")
    def on_user_speech(msg: llm.ChatMessage):
        if msg.content:
            print(f"🎤 USER TRANSCRIPT: {msg.content}")

    # 3. Finalized agent messages (Before TTS)
    @session.on("agent_speech_committed")
    def on_agent_speech(msg: llm.ChatMessage):
        print(f"🛰️ AGENT FINAL TEXT: {msg.content}")

    await session.start(room=ctx.room, agent=InterviewAssistant(question))
    # @session.on("agent_state_changed")
    # def on_state_change(ev):
    #     print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    # await session.start(room=ctx.room, agent=InterviewAssistant(question))

    # Using session.generate_reply is the standard way to trigger speech in 1.0
    await session.generate_reply(instructions=f"Say exactly: 'Hi, I'm Chris. Let's begin with {question}'")

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)   

