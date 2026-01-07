import dotenv from 'dotenv';
dotenv.config();

export const livekitConfig = {
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
  wsUrl: process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || 'ws://localhost:7880',
  host: (process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || 'ws://localhost:7880')
    .replace('wss://', 'https://')
    .replace('ws://', 'http://'),
};

export const deepgramConfig = {
  apiKey: process.env.DEEPGRAM_API_KEY || '',
};

export const elevenLabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY || '',
  voiceId: process.env.ELEVENLABS_VOICE_ID || 'Rachel',
};

export const groqConfig = {
  apiKey: process.env.GROQ_API_KEY || '',
};

// Validate configuration
if (!livekitConfig.apiKey || !livekitConfig.apiSecret) {
  console.warn('⚠️  LiveKit configuration is incomplete.');
}

if (!deepgramConfig.apiKey) {
  console.warn('⚠️  Deepgram API key is missing. STT will fail.');
}

if (!elevenLabsConfig.apiKey) {
  console.warn('⚠️  ElevenLabs API key is missing. TTS will fail.');
}

if (!groqConfig.apiKey) {
  console.warn('⚠️  Groq API key is missing. Evaluation will fail.');
}
