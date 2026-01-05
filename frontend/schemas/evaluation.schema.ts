export interface EvaluationReport {
  sessionId: string;
  questions: string[];
  finalCode: string;
  evaluation: {
    strengths: string[];
    improvements: string[];
    missingEdgeCases: string[];
    nextSteps: string[];
  };
  completedAt: Date;
}

export interface EvaluationFeedback {
  strengths: string[];
  improvements: string[];
  missingEdgeCases: string[];
  nextSteps: string[];
}
