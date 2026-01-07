import Groq from 'groq-sdk';
import { groqConfig } from '../../config/services';
import { interviewOrchestrator } from '../interview-orchestrator/interviewOrchestrator';

export class InterviewerAgent {
  private groq: Groq;
  private conversationHistory: Map<string, any[]> = new Map();

  constructor() {
    this.groq = new Groq({ apiKey: groqConfig.apiKey });
  }

  async processUserMessage(sessionId: string, userMessage: string): Promise<string> {
    try {
      // Get interview context
      const state = await interviewOrchestrator.getInterviewState(sessionId);
      if (!state) {
        return 'I apologize, but I cannot find your interview session. Please start a new interview.';
      }

      // Get conversation history
      let history = this.conversationHistory.get(sessionId) || [];
      
      // Add system context
      if (history.length === 0) {
        history.push({
          role: 'system',
          content: this.buildSystemPrompt(state.agentContext),
        });
      }

      // Add user message
      history.push({
        role: 'user',
        content: userMessage,
      });

      // Check for end interview intent
      if (this.detectEndIntent(userMessage)) {
        return 'Thank you for completing the interview. Please click the "End Interview" button to see your results.';
      }

      // Generate response
      const completion = await this.groq.chat.completions.create({
        messages: history,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 500,
      });

      const response = completion.choices[0]?.message?.content || 'I apologize, could you repeat that?';

      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: response,
      });

      // Keep last 20 messages
      if (history.length > 20) {
        history = [history[0], ...history.slice(-19)];
      }

      this.conversationHistory.set(sessionId, history);

      return response;
    } catch (error) {
      console.error('Agent error:', error);
      return 'I apologize, I encountered an error. Could you try rephrasing your response?';
    }
  }

  private buildSystemPrompt(agentContext: string): string {
    return `
You are an expert technical interviewer conducting a live coding interview.

${agentContext}

[Turn Control & Silence Rules]
- Long periods of silence are expected while the candidate is coding.
- Do NOT speak or interrupt during silence.
- Only respond after the candidate finishes speaking.
- Never end the interview due to silence.
- The interview ends ONLY if:
  - the candidate explicitly says "end interview", "I'm done", or "let's wrap up", OR
  - the system signals an end via UI action.

[Interviewer Behavior]
- Ask one question at a time
- Wait for complete answers
- Ask follow-ups about time complexity, edge cases, and optimizations
- Challenge assumptions constructively
- Be encouraging but maintain professional standards
- If they ask for hints, provide gentle guidance without giving away the solution

Remember: You are evaluating their problem-solving process, not just the final code.
    `.trim();
  }

  private detectEndIntent(message: string): boolean {
    const endPhrases = [
      'end interview',
      'end the interview',
      "i'm done",
      'im done',
      "let's wrap up",
      'lets wrap up',
      'finish interview',
      "that's all",
      'thats all',
    ];

    const lowerMessage = message.toLowerCase().trim();
    return endPhrases.some(phrase => lowerMessage.includes(phrase));
  }

  clearHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}

export const interviewerAgent = new InterviewerAgent();
