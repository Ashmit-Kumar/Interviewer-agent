export const vapiConfig = {
  privateKey: process.env.VAPI_PRIVATE_KEY || '',
  publicKey: process.env.VAPI_PUBLIC_KEY || '',
  agentId: process.env.VAPI_AGENT_ID || '',
  webhookSecret: process.env.VAPI_WEBHOOK_SECRET || '',
};

export const groqConfig = {
  apiKey: process.env.GROQ_API_KEY || '',
  model: 'llama-3.1-70b-versatile', // Fast and capable model for evaluation
};

export const deepgramConfig = {
  apiKey: process.env.DEEPGRAM_API_KEY || '',
};

export const elevenlabsConfig = {
  apiKey: process.env.ELEVENLABS_API_KEY || '',
};
