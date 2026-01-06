export interface InterviewState {
  sessionId: string;
  currentQuestionIndex: number;
  totalQuestionsAsked: number;
  interviewPhase: 'introduction' | 'question' | 'explanation' | 'followup' | 'completed';
  lastQuestionAskedAt?: Date;
  codeSnapshotCount: number;
  agentContext: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface CodeSnapshot {
  code: string;
  timestamp: Date;
}

export interface EvaluationResult {
  strengths: string[];
  improvements: string[];
  edgeCases: string[];
  nextSteps: string[];
}
