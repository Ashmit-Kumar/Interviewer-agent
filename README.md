# Interview Platform — Readme

This repository is a monorepo for an AI-powered interview practice platform. It contains a Next.js frontend, an Express + TypeScript backend, and a Python LiveKit-based voice agent.

Goals
- Run live voice interviews with an AI interviewer
- Capture transcripts and candidate code edits
- Generate structured evaluations after each interview

Contents
- `frontend/` — Next.js app (UI, interview experience, results)
- `backend/` — Express API (session management, evaluation service)
- `agent/` — Python LiveKit agent (STT, LLM, TTS, evaluation delivery)

Prerequisites
- Node.js v18+ (frontend & backend)
- Python 3.10+ (agent)
- MongoDB (local or Atlas)
- Redis
- npm or yarn

Quick Setup
1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install

# Agent (Python)
cd ../agent
pip install -r requirements.txt
```

2. Configure environment variables

- Backend: copy `.env.example` to `.env` and set:
   - `MONGODB_URI` (required)
   - `REDIS_HOST`, `REDIS_PORT` (if using Redis)
   - `GROQ_API_KEY` (LLM)
   - `VAPI_PRIVATE_KEY`, `VAPI_PUBLIC_KEY`, `VAPI_AGENT_ID` (optional)

- Frontend: copy `.env.local.example` to `.env.local` and set:
   - `NEXT_PUBLIC_API_URL` (default `http://localhost:5000/api`)

- Agent: set `MONGODB_URI` and optionally `BACKEND_URL` (default `http://localhost:5000`)

3. Start services

Start MongoDB and Redis as needed, then run backend and frontend in separate terminals:

```powershell
# Backend
cd backend
npm run seed   # seeds sample questions
npm run dev

# Frontend
cd ../frontend
npm run dev

# Agent (in a new terminal)
cd ../agent
python -m venv .venv  # optional
.\.venv\Scripts\activate
pip install -r requirements.txt
python agent.py  # or use your start script
```

Using the included Windows batch files
------------------------------------

This repository includes three helper batch files at the repo root for Windows users:

- `install.bat` — installs dependencies and creates the Python virtual environment for the agent.
- `start.bat` — launches the Python agent, backend, and frontend in separate command windows.
- `stop.bat` — kills Node and Python processes started by `start.bat`.

Run them from PowerShell in the repository root (`D:\java_prog\Projects\Interview_platform`):

```powershell
# Install dependencies and create the agent venv
.\install.bat

# Start services (each service opens in its own window)
.\start.bat

# Stop services
.\stop.bat
```

Notes
- If you see permission errors, run PowerShell as Administrator. Most users don't need admin rights.
- `install.bat` will create `agent\venv` and install Python packages into it; if you already have a venv, it will reuse it.
- `start.bat` uses `start` to open new terminals — close those terminal windows to stop the individual service, or use `stop.bat` to stop all services.
- If the agent doesn't start, activate the venv manually and run the agent for debugging:

```powershell
cd agent
.\venv\Scripts\activate
python agent.py
```


URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Backend health: http://localhost:5000/health

Key Endpoints
- POST `/api/sessions/start` — create a session
- PUT `/api/sessions/:sessionId/code` — update candidate code snapshot
- POST `/api/sessions/:sessionId/end` — mark session ended (backend orchestrator)
- PUT `/api/sessions/:sessionId/evaluation` — agent POSTs evaluation (schema-compliant)
- GET `/api/sessions/:sessionId/results` — fetch results/evaluation

Agent & Evaluation Flow (High-level)
1. Frontend requests a new session and creates a LiveKit room.
2. The Python agent joins the room, processes audio (STT), uses an LLM to respond, and TTS to speak.
3. When interview ends (token [[END_INTERVIEW]] or user action), agent generates a structured evaluation and sends it to backend via `/api/sessions/:sessionId/evaluation`.
4. Backend persists evaluation and sets session `status` to `evaluated`.
5. Frontend polls `/results` and shows the evaluation once available.

Schema Notes
- `Session.transcripts.role` must be `user` or `assistant` (case-sensitive). Agent and backend sanitize roles before saving.
- `evaluation` is an object with arrays: `strengths`, `improvements`, `edgeCases`, `nextSteps`, and `generatedAt` (ISO datetime string).

Troubleshooting
- 500 when saving evaluation: ensure agent payload is schema-compliant (no extra types in `transcripts.role`) and includes `evaluation.generatedAt` to avoid conflicting update operators.
- MongoDB connection: verify `MONGODB_URI` and that MongoDB is running.
- CORS issues: set `FRONTEND_URL` in backend `.env` or configure CORS accordingly.

Testing the evaluation endpoint with curl

```bash
curl -X PUT http://localhost:5000/api/sessions/<sessionId>/evaluation \
   -H "Content-Type: application/json" \
   -d '{
      "status":"evaluated",
      "finalCode":"",
      "evaluation": {"strengths":["Good"], "improvements":[], "edgeCases":[], "nextSteps":[], "generatedAt":"2026-01-11T00:00:00Z"},
      "transcripts": [{"role":"user","content":"Hi"}]
   }'
```

Development Tips
- Use the browser devtools Network tab to inspect API calls.
- Check backend logs for Mongoose validation errors to see which field fails.

Contributing
- Fork, create a feature branch, run tests, and open a PR.

License
- MIT

Contact
- For questions, open an issue in this repo or message the maintainer.
