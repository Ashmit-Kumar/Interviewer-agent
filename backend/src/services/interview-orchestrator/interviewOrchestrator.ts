import { getRedisClient } from '../../config/redis';
import { InterviewState } from '../../models/types';
import { QuestionRepository } from '../../repositories/questionRepository';
import { IQuestion } from '../../models/Question';

export class InterviewOrchestrator {
  private questionRepo: QuestionRepository;

  constructor() {
    this.questionRepo = new QuestionRepository();
  }

  async initializeInterview(sessionId: string): Promise<{ question: IQuestion; agentContext: string }> {
    const redis = getRedisClient();

    // Get first question
    const question = await this.questionRepo.getRandomQuestion('Easy');
    if (!question) {
      throw new Error('No questions available');
    }

    // Initialize interview state in Redis
    const initialState: InterviewState = {
      sessionId,
      currentQuestionIndex: 0,
      totalQuestionsAsked: 1,
      interviewPhase: 'introduction',
      lastQuestionAskedAt: new Date(),
      codeSnapshotCount: 0,
      agentContext: this.buildInitialContext(question),
    };

    await redis.set(
      `interview:${sessionId}`,
      JSON.stringify(initialState),
      { EX: 3600 } // Expire after 1 hour
    );

    return {
      question,
      agentContext: initialState.agentContext,
    };
  }

  async getInterviewState(sessionId: string): Promise<InterviewState | null> {
    const redis = getRedisClient();
    const stateJson = await redis.get(`interview:${sessionId}`);
    
    if (!stateJson) return null;
    
    return JSON.parse(stateJson);
  }

  async updateInterviewState(sessionId: string, updates: Partial<InterviewState>): Promise<void> {
    const redis = getRedisClient();
    const currentState = await this.getInterviewState(sessionId);
    
    if (!currentState) {
      throw new Error('Interview state not found');
    }

    const updatedState = { ...currentState, ...updates };
    
    await redis.set(
      `interview:${sessionId}`,
      JSON.stringify(updatedState),
      { EX: 3600 }
    );
  }

  async getNextQuestion(sessionId: string): Promise<{ question: IQuestion; agentContext: string } | null> {
    const state = await this.getInterviewState(sessionId);
    if (!state) return null;

    // For now, get another random question
    // In production, this would follow interview progression logic
    const question = await this.questionRepo.getRandomQuestion();
    if (!question) return null;

    // Update state
    await this.updateInterviewState(sessionId, {
      currentQuestionIndex: state.currentQuestionIndex + 1,
      totalQuestionsAsked: state.totalQuestionsAsked + 1,
      interviewPhase: 'question',
      lastQuestionAskedAt: new Date(),
      agentContext: this.buildQuestionContext(question),
    });

    return {
      question,
      agentContext: this.buildQuestionContext(question),
    };
  }

  async handleFollowUp(sessionId: string, topic: string): Promise<string> {
    const state = await this.getInterviewState(sessionId);
    if (!state) {
      throw new Error('Interview state not found');
    }

    // Update phase to follow-up
    await this.updateInterviewState(sessionId, {
      interviewPhase: 'followup',
    });

    // Generate follow-up context for agent
    return `Ask a follow-up question about ${topic}. Probe deeper into their understanding.`;
  }

  async completeInterview(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    
    // Update state to completed
    await this.updateInterviewState(sessionId, {
      interviewPhase: 'completed',
    });

    // Keep state for a bit longer for final processing
    await redis.expire(`interview:${sessionId}`, 300); // 5 minutes
  }

  private buildInitialContext(question: IQuestion): string {
    return `
You are conducting a coding interview. Start by introducing yourself warmly, then present this problem:

Title: ${question.title}
Difficulty: ${question.difficulty}
Description: ${question.description}

Constraints:
${question.constraints.map((c: string) => `- ${c}`).join('\n')}

After explaining the problem, encourage the candidate to think aloud and ask clarifying questions.
    `.trim();
  }

  private buildQuestionContext(question: IQuestion): string {
    return `
Present this new coding problem to the candidate:

Title: ${question.title}
Difficulty: ${question.difficulty}
Description: ${question.description}

Constraints:
${question.constraints.map((c: string) => `- ${c}`).join('\n')}

Encourage them to explain their approach before coding.
    `.trim();
  }
}
