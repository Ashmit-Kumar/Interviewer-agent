# Complete Project Setup Guide

This is a monorepo containing both frontend and backend for the AI Interview Practice Platform.

## Prerequisites

Before starting, ensure you have:
- **Node.js** (v18 or higher)
- **MongoDB** (running locally or remote connection)
- **Redis** (running locally)
- **npm** or **yarn**

---

## Quick Start

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

#### Backend (.env)
```bash
cd backend
cp .env.example .env
# Edit .env with your actual keys
```

Required keys:
- `MONGODB_URI` - MongoDB connection string
- `REDIS_HOST`, `REDIS_PORT` - Redis configuration
- `GROQ_API_KEY` - Get from https://console.groq.com
- `VAPI_PRIVATE_KEY`, `VAPI_PUBLIC_KEY`, `VAPI_AGENT_ID` - Get from https://vapi.ai

#### Frontend (.env.local)
```bash
cd frontend
cp .env.local.example .env.local
```

Set:
- `NEXT_PUBLIC_API_URL=http://localhost:5000/api`

### 3. Start Services

**Terminal 1 - MongoDB (if local):**
```bash
mongod
```

**Terminal 2 - Redis:**
```bash
redis-server
```

**Terminal 3 - Backend:**
```bash
cd backend
npm run seed  # Seed database with questions
npm run dev   # Start backend server
```

**Terminal 4 - Frontend:**
```bash
cd frontend
npm run dev   # Start Next.js dev server
```

### 4. Access Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health

---

## Project Structure

```
Interview_platform/
├── frontend/                 # Next.js frontend
│   ├── app/                  # Pages (landing, interview, results)
│   ├── components/           # React components
│   ├── lib/                  # API clients and utilities
│   └── package.json
│
├── backend/                  # Express backend
│   ├── src/
│   │   ├── config/          # Database & service configs
│   │   ├── controllers/     # API controllers
│   │   ├── models/          # MongoDB schemas
│   │   ├── repositories/    # Data access layer
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   │   ├── evaluation/  # Groq LLM evaluation
│   │   │   └── interview-orchestrator/  # Interview state machine
│   │   └── server.ts        # Entry point
│   └── package.json
│
└── README.md                 # This file
```

---

## Key Features

### Frontend
✅ Dark themed UI with glassmorphism effects
✅ Monaco code editor for live coding
✅ Real-time AI transcription display
✅ Voice agent controls (mute/unmute, end call)
✅ Results page with structured feedback

### Backend
✅ RESTful API with Express + TypeScript
✅ MongoDB for persistent storage
✅ Redis for temporary interview state
✅ Vapi integration for voice AI
✅ Groq LLM for evaluation
✅ Interview orchestration engine

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/start` | Start new interview |
| PUT | `/api/sessions/:id/code` | Update code snapshot |
| POST | `/api/sessions/:id/end` | End interview |
| GET | `/api/sessions/:id/results` | Get evaluation results |
| POST | `/api/vapi/webhook` | Vapi event webhook |

---

## Getting API Keys

### Groq (LLM Evaluation)
1. Visit https://console.groq.com
2. Sign up/login
3. Navigate to API Keys
4. Create new key
5. Add to backend `.env` as `GROQ_API_KEY`

### Vapi (Voice AI)
1. Visit https://vapi.ai
2. Create account
3. Create a new agent in dashboard
4. Configure agent with:
   - System prompt for interviewer behavior
   - Enable tools/functions
   - Set webhook URL to your backend
5. Copy keys to backend `.env`:
   - `VAPI_PRIVATE_KEY`
   - `VAPI_PUBLIC_KEY`
   - `VAPI_AGENT_ID`

### MongoDB
- **Local**: `mongodb://localhost:27017/interview-platform`
- **Atlas**: Get connection string from https://cloud.mongodb.com

### Redis
- **Local**: Default `localhost:6379`
- **Cloud**: Use Redis Cloud or similar

---

## Development Workflow

1. **Start Services**: MongoDB, Redis, Backend, Frontend
2. **Make Changes**: Edit code in respective directories
3. **Test Locally**: Open http://localhost:3000
4. **Debug**: Check terminal logs for errors

### Hot Reload
- **Frontend**: Auto-reloads on save
- **Backend**: Uses nodemon for auto-restart

---

## Troubleshooting

### "Cannot connect to MongoDB"
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in backend `.env`

### "Redis connection failed"
- Ensure Redis is running: `redis-server`
- Check `REDIS_HOST` and `REDIS_PORT`

### "CORS errors"
- Verify `FRONTEND_URL` in backend `.env` matches frontend URL
- Check backend CORS configuration

### "Vapi not responding"
- Verify API keys are correct
- Check webhook URL is accessible
- Review Vapi dashboard logs

---

## Production Deployment

### Backend
1. Build: `npm run build`
2. Start: `npm start`
3. Deploy to cloud provider (Heroku, Railway, etc.)
4. Set environment variables in hosting platform

### Frontend
1. Build: `npm run build`
2. Deploy to Vercel/Netlify
3. Set `NEXT_PUBLIC_API_URL` to production backend URL

---

## Next Steps

After setup, you can:
1. **Test the flow**: Start interview → Code → End → View results
2. **Add more questions**: Edit `backend/src/utils/seedQuestions.ts`
3. **Customize agent**: Update Vapi agent configuration
4. **Enhance UI**: Modify frontend components

---

## Support

For issues or questions:
- Check backend logs: `npm run dev` in backend folder
- Check browser console for frontend errors
- Review API responses in Network tab

---

## License

MIT
