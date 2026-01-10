# LiveKit Interview Agent (Python)

## Setup

1. **Install Python 3.10+**
   ```bash
   python --version  # Should be 3.10 or higher
   ```

2. **Create virtual environment**
   ```bash
   cd agent
   python -m venv venv
   
   # Windows
   venv\Scripts\activate
   
   # Mac/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

## Running

### Development (auto-restart)
```bash
python agent.py dev
```

### Production
```bash
python agent.py start
```

## How It Works

1. **Backend creates session** → Stores in MongoDB with session ID
2. **Backend generates LiveKit token** → Passes session ID in room metadata
3. **User joins room** → Agent automatically dispatches
4. **Agent loads session** → Fetches question from MongoDB
5. **Voice interview begins** → Deepgram STT → Groq LLM → ElevenLabs TTS
6. **Transcripts published** → Via LiveKit data tracks
7. **End interview** → Agent tool or user says "end interview"
8. **Backend evaluates** → Fetches transcripts + code → Groq evaluation

## Architecture

```
Browser ←WebRTC→ LiveKit Cloud ←Agent Connection→ Python Agent
                      ↓                                ↓
                 Express Backend ←───────────→ MongoDB
```

## Key Features

- ✅ **Auto-dispatch**: Agent joins when participant connects
- ✅ **MongoDB integration**: Fetches questions and saves notes
- ✅ **Voice pipeline**: Deepgram + Groq + ElevenLabs
- ✅ **Tools**: End interview, save observations
- ✅ **Interruptions**: Natural conversation flow
- ✅ **Short responses**: Optimized prompts for speech

## Troubleshooting

**Agent not joining?**
- Check LiveKit console → Agents tab
- Verify API keys in .env
- Check room metadata has session ID

**No audio?**
- Verify Deepgram API key
- Check browser microphone permissions
- Test with `python agent.py dev` (shows logs)

**MongoDB connection failed?**
- Start MongoDB: `brew services start mongodb-community`
- Check MONGODB_URI in .env
