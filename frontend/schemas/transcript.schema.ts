export interface TranscriptMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

export interface TranscriptEvent {
  type: "transcript";
  role: "assistant" | "user";
  transcript: string;
  timestamp: string;
}
