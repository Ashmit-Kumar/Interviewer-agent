export const CONSTANTS = {
  // API
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  
  // Vapi
  VAPI_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "",
  VAPI_ASSISTANT_ID: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || "",
  
  // Code Editor
  DEFAULT_LANGUAGE: "javascript",
  AUTOSAVE_DELAY_MS: 2000,
  
  // Session
  SESSION_STATUS: {
    ACTIVE: "active" as const,
    ENDED: "ended" as const,
  },
  
  // Transcript
  TRANSCRIPT_ROLES: {
    ASSISTANT: "assistant" as const,
    USER: "user" as const,
  },
} as const;
