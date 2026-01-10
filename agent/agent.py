"""
LiveKit AI Interview Agent
Handles voice-based technical interviews with live coding
Uses modern AgentSession API
"""
"hello"

import os
import asyncio
import json
from datetime import datetime
from dotenv import load_dotenv

from livekit.agents import (
    AgentSession,
    Agent,
    AgentServer,
    JobContext,
    function_tool,
)
# Import plugins directly
from livekit.plugins import silero, deepgram, elevenlabs, groq

import pymongo

# Load environment variables
load_dotenv()

# MongoDB connection
mongo_client = pymongo.MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
db = mongo_client["interview_platform"]
sessions_collection = db["sessions"]
questions_collection = db["questions"]

# Initialize agent server
server = AgentServer()


class InterviewAgent(Agent):
    """AI Interview Agent with tools for session management"""
    
    def __init__(self, session_id: str, question_text: str):
        self.session_id = session_id
        self.question_text = question_text
        self.interview_active = True
        
        # Initialize with instructions
        instructions = f"""You are a professional technical interviewer conducting a live coding interview.

**Your Question**: {question_text}

**Interview Guidelines**:
• Speak in SHORT sentences (max 2 sentences at a time)
• Ask ONE follow-up question at a time
• Pause after each question to let the candidate think
• Allow interruptions - never talk over the candidate
• Challenge edge cases and complexity analysis
• If candidate is stuck, give subtle hints
• Listen for "end interview" or "I'm done" to conclude

**Behavior Rules**:
• Never monologue or give long explanations
• Keep responses conversational and natural
• Focus on understanding their thought process
• Ask clarifying questions about their approach
• Discuss time/space complexity when relevant
• Be encouraging but thorough
"""
        super().__init__(instructions=instructions)
    
    @function_tool()
    async def end_interview(self, reason: str):
        """Call this when the candidate says they want to end the interview or says they're done.
        
        Args:
            reason: Why the interview is ending
        """
        self.interview_active = False
        
        # Update session status in MongoDB
        sessions_collection.update_one(
            {"sessionId": self.session_id},
            {"$set": {"status": "ended", "endedAt": datetime.utcnow(), "endReason": reason}}
        )
        
        return f"Interview ending: {reason}. Thank you for your time!"
    
    @function_tool()
    async def save_transcript_note(self, note: str):
        """Save an important observation during the interview.
        
        Args:
            note: Important observation about candidate's approach
        """
        sessions_collection.update_one(
            {"sessionId": self.session_id},
            {"$push": {"agentNotes": note}}
        )
        return "Note saved"


@server.rtc_session()
async def entrypoint(ctx: JobContext):
    """Main entrypoint for the agent
    Gets called when a participant joins the room
    """
    
    await ctx.connect()
    
    # Parse room metadata (backend should send JSON with sessionId)
    try:
        room_metadata = json.loads(ctx.room.metadata or "{}")
        session_id = room_metadata.get("sessionId")
    except json.JSONDecodeError:
        # Fallback: treat as plain string sessionId for backward compatibility
        session_id = ctx.room.metadata
        print(f"⚠️  Warning: room.metadata is not JSON, using raw value: {session_id}")
    
    if not session_id:
        print("❌ No session ID in room metadata")
        return
    
    print(f"🚀 Starting interview agent for session: {session_id}")
    
    # Load session data from MongoDB
    session_data = sessions_collection.find_one({"sessionId": session_id})
    if not session_data:
        print(f"❌ Session {session_id} not found in MongoDB")
        return
    
    # Load the question
    question_text = "a coding problem"
    if session_data.get("questionsAsked") and len(session_data["questionsAsked"]) > 0:
        # questionsAsked stores question titles/text, not IDs
        question_text = session_data["questionsAsked"][0]
        print(f"✅ Using question: {question_text}")
    
    print(f"✅ Loaded session with question: {question_text[:50]}...")
    
    # Create agent session with AI models
    session = AgentSession(
        vad=silero.VAD.load(),
        stt=f"deepgram/nova-2",
        llm=f"groq/llama-3.1-70b-versatile",
        tts=f"elevenlabs/{os.getenv('ELEVENLABS_VOICE_ID', 'nPczCjzI2devNBz1zQrb')}",
    )
    
    # Create interview agent with tools
    interview_agent = InterviewAgent(session_id, question_text)
    
    # Start the session
    await session.start(
        room=ctx.room,
        agent=interview_agent,
    )
    
    # Initial greeting
    greeting = f"Hi! I'm your AI interviewer today. Let's start with this question: {question_text}. Take your time to think through your approach and explain your reasoning as you go."
    
    await session.say(greeting, allow_interruptions=True)
    
    print("🎤 Agent is live and listening")
    
    # Keep agent alive until interview ends or room disconnects
    try:
        while interview_agent.interview_active and ctx.room.connection_state == "connected":
            await asyncio.sleep(1)
        
        # Final message if interview ended normally
        if interview_agent.interview_active:
            print("⚠️  Room disconnected unexpectedly")
        else:
            await session.say("Thank you for your time! Your interview results will be available shortly.")
            print("✅ Interview completed")
    except Exception as e:
        print(f"❌ Agent error: {e}")
        # Update session status to indicate error
        sessions_collection.update_one(
            {"sessionId": session_id},
            {"$set": {"status": "ended", "endedAt": datetime.utcnow(), "endReason": f"error: {str(e)}"}}
        )


if __name__ == "__main__":
    # Run the agent server
    import asyncio
    asyncio.run(server.run())
