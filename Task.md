Interview Practice Platform
A web application that anyone can open and use to practice a coding interview.
The user opens the web app
They start a live interview session
A voice-based AI interviewer:
Presents a coding question (verbally and in writing)
Asks follow-up questions
Reacts to the candidate’s explanations
The candidate:
Writes code in a code editor
Explains their approach verbally
Iterates on the solution
This is a collaborative interview
The interview continues until, the candidate:
Clicks End Call
After ending:
The code and the discussions is evaluated by an LLM
The user is taken to a Results Screen
What Is Explicitly Out of Scope
To avoid over-engineering, do not focus on:
Authentication / login
User accounts
Dashboards
History of past interviews
This is a single-session, stateless-user experience.
Core Features & Flows
1. Interview Session Flow
Step 1: Start Interview
Landing page has a Start Interview button
Clicking it:
Creates a new interview session
Initializes LiveKit or Vapi
Interview starts
2. Interview Screen (Main Screen)
This is the most important part of the assignment.
Mandatory Sections on Screen
Code Editor Panel
Monaco Editor
Language can be fixed (eg: JavaScript)
Code state must be accessible to backend when submitting
Transcription Panel
Displays the agent’s transcripts 
Should update as and when the agent speaks. New transcripts come below and scrolls the older one.
Voice Agent Panel
Controls:
Mute / Unmute
End Call
Shows speaking / listening state
3. Voice Agent Behavior
The AI interviewer should:
Read out the question
Ask clarifying questions
Ask the candidate to explain their logic
Challenge edge cases
Ask complexity-related follow-ups
The agent must continue the interview loop (keep asking new problems / follow up questions) until:
User clicks End Call, or
User explicitly says something like:
“End the interview”
“I’m done”
4. Code Submission & Evaluation
At the call end, you have access to the final code and the interview transcripts of both agent and the candidate, you have to process these using LLM to generate a report of that interview which is shown in the reports page.

5. Reports Screen
This screen should show:
Questions
Candidate’s Final Code (read-only Monaco or formatted view)
LLM Feedback, clearly structured:
What was done well
What could be improved
Missing edge cases
Next steps for preparation
No navigation to previous interviews is required.
Tech Stack
Frontend
TypeScript
React / Next.js
Tailwind CSS
ShadCN UI
Monaco Editor (@monaco-editor/react or equivalent)
Backend
Node.js
TypeScript
Express
MongoDB (via Mongoose)
Redis
AI / Media
You may choose either:
LiveKit (Python-based service), OR
Vapi (TypeScript-based)
For AI services:
LLM: Groq (free tier)
Speech-to-Text: Deepgram
Text-to-Speech: ElevenLabs
(You are free to use other providers. We recommend them because they provide free credits)
Note: Deepgram and Elevenlabs provide some free credits. If any help is needed regarding credits, kindly reach out to Aditya (founder) - +91-7814520243
Submission Guidelines
This assignment does NOT require live deployment. A working local setup is sufficient.
Mandatory
GitHub repository link (monorepo or separate repos both acceptable)
README (Required)
Your repository must contain a clear README explaining:
How to run the frontend locally
How to run the backend locally
Environment variables required (with sample .env.example)
Timeline
You have a week to complete this assignment. You can use AI tools of your choice (ChatGPT, Claude, Cursor, Claude Code, v0.dev, etc.).
Extra time can be provided if good progress is being made.
Contact
For any queries, you can reach out to Aditya (founder) at +91-7814520243. You can WhatsApp/Call.
