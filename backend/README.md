# Backend Setup and Run Instructions

## Prerequisites

Make sure you have the following installed:
- Node.js (v18 or higher)
- MongoDB (running locally or connection string)
- Redis (running locally)

## Installation

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```env
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/interview-platform

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Vapi Keys (get from https://vapi.ai)
VAPI_PRIVATE_KEY=your_private_key
VAPI_PUBLIC_KEY=your_public_key
VAPI_AGENT_ID=your_agent_id

# Groq API Key (get from https://console.groq.com)
GROQ_API_KEY=your_groq_api_key

# Optional: Deepgram & ElevenLabs (configured in Vapi)
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key

FRONTEND_URL=http://localhost:3000
```

## Database Setup

1. Make sure MongoDB is running locally or provide a connection string

2. Seed the database with sample questions:
```bash
npm run seed
```

## Running the Server

### Development mode (with hot reload):
```bash
npm run dev
```

### Production mode:
```bash
npm run build
npm start
```

The server will start on `http://localhost:5000`

## API Endpoints

### Session Management
- `POST /api/sessions/start` - Start a new interview session
- `PUT /api/sessions/:sessionId/code` - Update code snapshot
- `POST /api/sessions/:sessionId/end` - End interview session
- `GET /api/sessions/:sessionId/results` - Get interview results

### Vapi Webhooks
- `POST /api/vapi/webhook` - Vapi event webhooks

### Health Check
- `GET /health` - Server health status

## Testing the API

You can test the API using curl:

```bash
# Health check
curl http://localhost:5000/health

# Start session
curl -X POST http://localhost:5000/api/sessions/start \
  -H "Content-Type: application/json"

# Update code
curl -X PUT http://localhost:5000/api/sessions/{sessionId}/code \
  -H "Content-Type: application/json" \
  -d '{"code": "function twoSum(nums, target) { ... }"}'

# End session
curl -X POST http://localhost:5000/api/sessions/{sessionId}/end \
  -H "Content-Type: application/json"

# Get results
curl http://localhost:5000/api/sessions/{sessionId}/results
```

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod`
- Check connection string in `.env`

### Redis Connection Issues
- Ensure Redis is running: `redis-server`
- Check Redis host/port in `.env`

### Vapi Integration
- Get API keys from https://vapi.ai
- Configure agent in Vapi dashboard
- Set webhook URL to your backend: `http://your-domain/api/vapi/webhook`

## Project Structure

```
backend/
├── src/
│   ├── config/          # Database & service configurations
│   ├── controllers/     # Request handlers
│   ├── middlewares/     # Error handling, validation
│   ├── models/          # MongoDB schemas
│   ├── repositories/    # Database operations
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   │   ├── evaluation/  # LLM evaluation service
│   │   └── interview-orchestrator/  # Interview state management
│   ├── utils/           # Utilities and seed scripts
│   └── server.ts        # Application entry point
├── .env                 # Environment variables
├── package.json
└── tsconfig.json
```
