
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
    def __init__(self, question: str, room=None):
        # Replace fullstops with commas in the question
        question = question.replace('.', ',')
        self._room = room
        
        super().__init__(
            instructions=f"""# Role
                You are Chris, an expert Technical Interviewer. Your goal is to conduct a professional, collaborative coding interview.

                # Context
                The candidate is solving this problem: {question}

                # Task Flow
                1. GREETING: You have already introduced yourself. Wait for the candidate to say they are ready.
                2. THE CHALLENGE: Once they are ready, your FIRST task is to clearly explain the problem '{question}' in plain English. 
                3. COLLABORATION: After explaining, ask them: "Does that make sense, or should I clarify anything?"
                4. GUIDANCE: As they code, provide small hints only if they struggle.
                5. DEEP DIVE: Once finished, ask about time complexity and edge cases.


                # Conversational Rules (Voice Optimized)
                - **CRITICAL**: Respond in plain text only. NO markdown, NO asterisks (**), NO backticks, NO lists, NO emojis.
                - **Punctuation**: NEVER use periods/full stops(.) at the end of sentences. ALWAYS use commas, question marks, and exclamation marks where appropriate for natural speech flow.
                - **Brevity**: Keep responses to 1-3 sentences. Ask only one question at a time.
                - **No Code**: Never speak code snippets. Explain logic in plain English (e.g., say "use a conditional statement" instead of "if-else").
                - **Natural Flow**: Speak in full, clear sentences with proper punctuation except periods.
                - **Encouragement**: Use positive language to motivate the candidate.
                - **Politeness**: Always be polite and professional.
                - **Engagement**: Ask open-ended questions to encourage the candidate to explain their thought process.
                - **Guidance**: Provide hints only when the candidate is stuck, never give away the solution.
                - **Closing**: End the interview politely when the candidate indicates they are done.
                - **Avoid Filler**: Do not use filler words like "um", "uh", "like", etc.
                - **Never**: Never use fullStops/periods(.) at the end of sentences.

                # Interview Flow
                - Start by briefly explaining the problem to the candidate.
                - If the candidate is stuck, provide a small hint.
                - Once they finish the code, ask them about time and space complexity.
                - Challenge them on edge cases like empty inputs or large data.
                - If they say they are done or want to end, say a polite goodbye."""
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
            full_text = ""
            async for text in stream:
                if text.strip():
                    print(f"🎙️ SENDING TO TTS: {text}")
                    full_text += text
                yield text
            
            # Send complete transcript to frontend when done
            if full_text.strip():
                print(f"🛰️ COMPLETE TRANSCRIPT: {full_text}")
                try:
                    # Use the room passed during initialization
                    if self._room:
                        transcript_data = json.dumps({
                            "type": "transcript",
                            "role": "assistant",
                            "content": full_text.strip()
                        })
                        await self._room.local_participant.publish_data(
                            transcript_data.encode('utf-8'),
                            reliable=True
                        )
                        print("✅ Transcript sent to frontend")
                except Exception as e:
                    print(f"❌ Failed to send transcript: {e}")
        
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

    await session.start(room=ctx.room, agent=InterviewAssistant(question, ctx.room))
    # @session.on("agent_state_changed")
    # def on_state_change(ev):
    #     print(f"🧠 AI STATE: {ev.old_state} -> {ev.new_state}")

    # await session.start(room=ctx.room, agent=InterviewAssistant(question))

    # Using session.generate_reply is the standard way to trigger speech in 1.0
    await session.generate_reply(instructions=f"Say exactly: 'Hi, I'm Chris, I'll be your interviewer today,  Are you ready to begin?'")

    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)   

