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
    async def llm_node(self, chat_ctx, tools, model_settings):
        print(f"DEBUG: LLM Node starting...")
        
        actual_stream = Agent.default.llm_node(self, chat_ctx, tools, model_settings)
        
        async def monitor_chunks(stream):
            full_text = ""
            async for chunk in stream:
                # In LiveKit 1.0, chunks often have a 'choices' list or direct 'delta'
                try:
                    content = chunk.choices[0].delta.content if chunk.choices else ""
                    if content:
                        full_text += content
                except (AttributeError, IndexError):
                    # Fallback for different plugin versions
                    if hasattr(chunk, 'delta') and chunk.delta.content:
                        full_text += chunk.delta.content
                yield chunk
            
            if full_text:
                print(f"🤖 GROQ RESPONDED: {full_text}")
            
        return monitor_chunks(actual_stream)

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

    @session.on("agent_state_changed")
    def on_state_change(ev):
        print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    await session.start(room=ctx.room, agent=InterviewAssistant(question))

    # Using session.generate_reply is the standard way to trigger speech in 1.0
    await session.generate_reply(instructions=f"Say exactly: 'Hi, I'm Chris. Let's begin with {question}'")

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)   


# """
# LiveKit Interview Agent - MINIMAL VERSION (NO OPTIONAL PLUGINS)
# 100% Guaranteed to start
# """
# import asyncio
# import os
# import json
# import pymongo
# from dotenv import load_dotenv
# from livekit.agents import JobContext, llm
# from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli, inference
# from livekit.plugins import silero
# from livekit.plugins import groq, deepgram, elevenlabs

# # Load environment variables
# load_dotenv()
# print("🔗 MongoDB connecting...")

# # MongoDB
# mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
# mongo_client.admin.command('ping')
# db = mongo_client["interview-platform"]
# sessions_collection = db["sessions"]
# print("✅ MongoDB ready")

# server = AgentServer()

# class InterviewAgent(Agent):
#     def __init__(self, session_id, question):
#         self.session_id = session_id
#         instructions = f"""Interview for: {question}
# • Speak 1-2 sentences only
# • Ask 1 question at a time
# • Pause after questions
# • Say END INTERVIEW to finish"""
#         super().__init__(instructions=instructions)

# @server.rtc_session()
# # async def entrypoint(ctx: JobContext):
# #     await ctx.connect()
    
# #     # Get session ID
# #     session_id = json.loads(ctx.room.metadata or "{}").get("sessionId") or ctx.room.metadata
# #     if not session_id:
# #         print("❌ No session")
# #         return
    
# #     print(f"🚀 Session: {session_id}")
    
# #     # Load question
# #     session_data = sessions_collection.find_one({"sessionId": session_id})
# #     if not session_data:
# #         print(f"❌ Session not found")
# #         return
    
# #     question = session_data.get("questionsAsked", ["test"])[0]
# #     print(f"✅ Question: {question}")
    
# #     # ✅ MINIMAL AgentSession (ONLY REQUIRED components)
# #     session = AgentSession(
# #         vad=silero.VAD.load(),
# #         stt=inference.STT(model="deepgram/nova-2"),
# #         llm=inference.LLM(model="openai/gpt-4.1-mini"),           # ✅ THIS WORKS
# #         tts=inference.TTS(model="elevenlabs/eleven_flash_v2_5", 
# #                         voice=os.getenv("ELEVENLABS_VOICE_ID"))
# #     )
    
# #     agent = InterviewAgent(session_id, question)
    
# #     await session.start(agent=agent, room=ctx.room)
# #     print("🎤 AGENT LIVE ✅")
# async def entrypoint(ctx: JobContext):
#     await ctx.connect()
    
#     # 1. Wait for the candidate to join
#     candidate = await ctx.wait_for_participant()
#     print(f"Candidate found: {candidate.identity}")
#     # chat_ctx = llm.ChatContext().add_message(
#     #     role="system",  # Must be ChatRole: "system", "user", or "assistant"
#     #     content="You are an interviewer. Speak 1-2 sentences only. Ask 1 question at a time. Say 'END INTERVIEW' to finish."
#     # )
#     # agent = Agent(
#     #     instructions="Follow the system instructions strictly.",
#     #     chat_ctx=chat_ctx
#     # )
#     # 2. Setup your agent (same as before)
#     agent = AgentSession(
#         vad=silero.VAD.load(),
#         stt=deepgram.STT(model="nova-2"),
#         llm=groq.LLM(model="llama-3.3-70b-versatile"),
#         tts=elevenlabs.TTS(api_key=os.getenv("ELEVENLABS_API_KEY"), model="eleven_flash_v2_5", 
#                         voice_id=os.getenv("ELEVENLABS_VOICE_ID")),
#         # agent=agent,
#         # chat_ctx=llm.ChatContext().append(
#         #     role="system",
#         #     text="You are an interviewer. Be brief."
#         # )
#     )

#     # 3. Start the agent AND link it to the candidate
#     agent.start(room=ctx.room) # <--- ADD 'candidate' HERE
    


#     # 4. Greet them immediately to confirm connection
#     await agent.say("Hello! I am your AI interviewer. Can you hear me clearly?", allow_interruptions=True)

#     while ctx.room.is_connected():
#         await asyncio.sleep(1)

# if __name__ == "__main__":
#     cli.run_app(server)





# import os, json, pymongo
# from dotenv import load_dotenv
# from livekit.agents import Agent, AgentServer, AgentSession, JobContext, cli
# from livekit.plugins import silero, deepgram, groq, elevenlabs

# load_dotenv()
# mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI"))
# load_dotenv()
# print(f"🔑 GROQ: {'✅' if os.getenv('GROQ_API_KEY') else '❌'}")
# print(f"🔑 DEEPGRAM: {'✅' if os.getenv('DEEPGRAM_API_KEY') else '❌'}") 
# print(f"🔑 ELEVEN: {'✅' if os.getenv('ELEVENLABS_API_KEY') else '❌'}")  # ← ADD THIS
# mongo_client.admin.command('ping')
# print("✅ MongoDB connected")
# db = mongo_client["interview-platform"]
# sessions_collection = db["sessions"]
# print("✅ MongoDB ready")

# server = AgentServer()

# class InterviewAgent(Agent):
#     def __init__(self, session_id, question):
#         self.session_id = session_id
#         instructions = f"""Interview question: {question}

# Speak naturally:
# • 1-2 sentences maximum
# • Ask 1 question at a time
# • Say "END INTERVIEW" to finish"""
#         super().__init__(instructions=instructions)

# @server.rtc_session()
# async def entrypoint(ctx: JobContext):
#     await ctx.connect()
    
#     session_id = json.loads(ctx.room.metadata or "{}").get("sessionId") or ctx.room.metadata
#     print(f"🚀 Session: {session_id}")
    
#     session_data = sessions_collection.find_one({"sessionId": session_id})
#     question = session_data.get("questionsAsked", ["test"])[0] if session_data else "test"
#     print(f"✅ Question: {question}")
    
#     # ✅ FULLY WORKING PIPELINE
#     session = AgentSession(
#         vad=silero.VAD.load(),
#         stt=deepgram.STT(model="nova-2"),                       # ✅ Deepgram STT
#         llm=groq.LLM(model="llama-3.3-70b-versatile"),             # ✅ Groq LLM
#         tts=elevenlabs.TTS(api_key=os.getenv('ELEVENLABS_API_KEY'))                                    # ✅ ElevenLabs TTS (uses ELEVEN_API_KEY)
#     )
    
#     agent = InterviewAgent(session_id, question)
#     await session.start(agent=agent, room=ctx.room)
#     print("🎤 INTERVIEW AGENT LIVE ✅ Say 'HELLO'!")

# if __name__ == "__main__":
#     cli.run_app(server)


# """
# LiveKit AI Interview Agent
# Handles voice-based technical interviews with live coding
# Uses modern AgentSession API
# """
# "hello"

# import os
# import asyncio
# import json
# from datetime import datetime
# from dotenv import load_dotenv
# from livekit.agents import (
#     Agent,
#     AgentServer,
#     AgentSession,
#     JobContext,
#     JobProcess,
#     cli,
#     inference,
#     room_io,
# )
# from livekit.plugins import (
#     silero,
#     # noise_cancellation,
# )
# from livekit import rtc
# from livekit.plugins.turn_detector.multilingual import MultilingualModel
# from livekit.agents import (
#     AgentSession,
#     Agent,
#     AgentServer,
#     JobContext,
#     function_tool,
# )
# # Import plugins directly
# from livekit.plugins import silero, deepgram, elevenlabs, groq

# import pymongo

# # Load environment variables
# load_dotenv()

# # MongoDB connection with extensive logging
# mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
# print(f"\n{'='*60}")
# print(f"🔧 MONGODB CONNECTION DETAILS")
# print(f"{'='*60}")
# print(f"MongoDB URI: {mongodb_uri[:30]}...{mongodb_uri[-20:] if len(mongodb_uri) > 50 else mongodb_uri}")
# print(f"Database: interview-platform")
# print(f"{'='*60}\n")

# try:
#     mongo_client = pymongo.MongoClient(mongodb_uri, serverSelectionTimeoutMS=5000)
#     # Test connection
#     mongo_client.admin.command('ping')
#     print("✅ MongoDB connection successful\n")
# except Exception as e:
#     print(f"❌ MongoDB connection failed: {e}\n")
#     raise

# db = mongo_client["interview-platform"]
# sessions_collection = db["sessions"]
# questions_collection = db["questions"]

# # Initialize agent server
# server = AgentServer()


# class InterviewAgent(Agent):
#     """AI Interview Agent with tools for session management"""
    
#     def __init__(self, session_id: str, question_text: str):
#         self.session_id = session_id
#         self.question_text = question_text
#         self.interview_active = True
        
#         # Initialize with instructions
#         instructions = f"""You are a professional technical interviewer conducting a live coding interview.

# **Your Question**: {question_text}

# **Interview Guidelines**:
# • Speak in SHORT sentences (max 2 sentences at a time)
# • Ask ONE follow-up question at a time
# • Pause after each question to let the candidate think
# • Allow interruptions - never talk over the candidate
# • Challenge edge cases and complexity analysis
# • If candidate is stuck, give subtle hints
# • Listen for "end interview" or "I'm done" to conclude

# **Behavior Rules**:
# • Never monologue or give long explanations
# • Keep responses conversational and natural
# • Focus on understanding their thought process
# • Ask clarifying questions about their approach
# • Discuss time/space complexity when relevant
# • Be encouraging but thorough
# """
#         super().__init__(instructions=instructions)
    
#     @function_tool()
#     async def end_interview(self, reason: str):
#         """Call this when the candidate says they want to end the interview or says they're done.
        
#         Args:
#             reason: Why the interview is ending
#         """
#         self.interview_active = False
        
#         # Update session status in MongoDB
#         sessions_collection.update_one(
#             {"sessionId": self.session_id},
#             {"$set": {"status": "ended", "endedAt": datetime.utcnow(), "endReason": reason}}
#         )
        
#         return f"Interview ending: {reason}. Thank you for your time!"
    
#     @function_tool()
#     async def save_transcript_note(self, note: str):
#         """Save an important observation during the interview.
        
#         Args:
#             note: Important observation about candidate's approach
#         """
#         sessions_collection.update_one(
#             {"sessionId": self.session_id},
#             {"$push": {"agentNotes": note}}
#         )
#         return "Note saved"


# @server.rtc_session()
# async def entrypoint(ctx: JobContext):
#     """Main entrypoint for the agent
#     Gets called when a participant joins the room
#     """
    
#     await ctx.connect()
    
#     # Parse room metadata (backend should send JSON with sessionId)
#     try:
#         room_metadata = json.loads(ctx.room.metadata or "{}")
#         session_id = room_metadata.get("sessionId")
#     except json.JSONDecodeError:
#         # Fallback: treat as plain string sessionId for backward compatibility
#         session_id = ctx.room.metadata
#         print(f"⚠️  Warning: room.metadata is not JSON, using raw value: {session_id}")
    
#     if not session_id:
#         print("❌ No session ID in room metadata")
#         return
    
#     print(f"\n{'='*60}")
#     print(f"🚀 Starting interview agent for session: {session_id}")
#     print(f"{'='*60}\n")
    
#     # Load session data from MongoDB (with retry for race condition)
#     session_data = None
#     max_retries = 5
#     retry_delay = 1.0  # seconds
    
#     for attempt in range(max_retries):
#         print(f"🔍 Attempt {attempt + 1}/{max_retries}: Querying MongoDB...")
#         print(f"   Database: {db.name}")
#         print(f"   Collection: {sessions_collection.name}")
#         print(f"   Query: {{sessionId: '{session_id}'}}")
        
#         session_data = sessions_collection.find_one({"sessionId": session_id})
        
#         if session_data:
#             print(f"✅ Session found!")
#             print(f"   Status: {session_data.get('status')}")
#             print(f"   Questions: {len(session_data.get('questionsAsked', []))}")
#             break
#         else:
#             # Debug: Show what sessions exist
#             total_sessions = sessions_collection.count_documents({})
#             print(f"❌ Session not found")
#             print(f"   Total sessions in DB: {total_sessions}")
            
#             if total_sessions > 0:
#                 recent_sessions = list(sessions_collection.find({}, {"sessionId": 1, "status": 1}).limit(5).sort("_id", -1))
#                 print(f"   Recent sessions:")
#                 for s in recent_sessions:
#                     print(f"      - {s.get('sessionId', 'unknown')} (status: {s.get('status', 'unknown')})")
        
#         if attempt < max_retries - 1:
#             print(f"⏳ Retrying in {retry_delay}s...\n")
#             await asyncio.sleep(retry_delay)
#         else:
#             print(f"\n{'='*60}")
#             print(f"❌ FAILED: Session {session_id} not found after {max_retries} attempts")
#             print(f"{'='*60}\n")
#             return
    
#     # Load the question
#     question_text = "a coding problem"
#     if session_data.get("questionsAsked") and len(session_data["questionsAsked"]) > 0:
#         # questionsAsked stores question titles/text, not IDs
#         question_text = session_data["questionsAsked"][0]
#         print(f"✅ Using question: {question_text}")
    
#     print(f"✅ Loaded session with question: {question_text[:50]}...")
    
#     # Create agent session with AI models
# # ✅ PRODUCTION AgentSession (matches reference)
#     session = AgentSession(
#         vad=ctx.proc.userdata["vad"],
#         stt=inference.STT(model="deepgram/nova-2", language="en"),
#         llm=inference.LLM(model="groq/llama-3.1-70b-versatile"),
#         tts=inference.TTS(
#             model="elevenlabs/eleven_flash_v2_5",  # ✅ From your .env
#             voice=os.getenv("ELEVENLABS_VOICE_ID", "iP95p4xoKVk53GoZ742B"),  # ✅ Your voice
#             language="en"
#         ),
#         turn_detection=MultilingualModel(),  # ✅ Reference feature
#         preemptive_generation=True,  # ✅ Natural interruption handling
#     )
#     # Create interview agent with tools
#     interview_agent = InterviewAgent(session_id, question_text)
    
#     # Start the session
#     await session.start(
#         agent=agent,
#         room=ctx.room,
#         # ✅ NO noise_cancellation = NO import errors
#         room_options=room_io.RoomOptions(),
#     )
#     # await session.start(
#     #     room=ctx.room,
#     #     agent=interview_agent,
#     # )
    
#     # Initial greeting
#     greeting = f"Hi! I'm your AI interviewer today. Let's start with this question: {question_text}. Take your time to think through your approach and explain your reasoning as you go."
    
#     await session.say(greeting, allow_interruptions=True)
    
#     print("🎤 Agent is live and listening")
    
#     # Keep agent alive until interview ends or room disconnects
#     try:
#         while interview_agent.interview_active and ctx.room.connection_state == "connected":
#             await asyncio.sleep(1)
        
#         # Final message if interview ended normally
#         if interview_agent.interview_active:
#             print("⚠️  Room disconnected unexpectedly")
#         else:
#             await session.say("Thank you for your time! Your interview results will be available shortly.")
#             print("✅ Interview completed")
#     except Exception as e:
#         print(f"❌ Agent error: {e}")
#         # Update session status to indicate error
#         sessions_collection.update_one(
#             {"sessionId": session_id},
#             {"$set": {"status": "ended", "endedAt": datetime.utcnow(), "endReason": f"error: {str(e)}"}}
#         )


# if __name__ == "__main__":
#     # Run the agent server
#     import asyncio
#     asyncio.run(server.run())
