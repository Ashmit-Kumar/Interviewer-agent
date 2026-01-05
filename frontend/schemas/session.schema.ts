export interface InterviewSession {
  sessionId: string;
  questionTitle: string;
  questionDescription?: string;
  status: "active" | "ended";
  code: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface SessionMetadata {
  sessionId: string;
  vapiAssistantId: string;
}
