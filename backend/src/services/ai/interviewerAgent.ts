import Groq from 'groq-sdk';
import { groqConfig } from '../../config/services';
import { interviewOrchestrator } from '../interview-orchestrator/interviewOrchestrator';

export interface Turn {
  text: string;
  pauseAfterMs: number;
}

export class InterviewerAgent {
  private groq: Groq;
  private conversationHistory: Map<string, Array<{role: string; content: string}>> = new Map();

  constructor() {
    this.groq = new Groq({ apiKey: groqConfig.apiKey });
  }

  async processUserMessage(sessionId: string, userMessage: string): Promise<Turn[]> {
    try {
      // Get interview context
      const state = await interviewOrchestrator.getInterviewState(sessionId);
      if (!state) {
        return [{
          text: 'I apologize, but I cannot find your interview session. Please start a new interview.',
          pauseAfterMs: 1500
        }];
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
        return [{
          text: 'Thank you for completing the interview. Please click the "End Interview" button to see your results.',
          pauseAfterMs: 2000
        }];
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

      // Convert response into structured turns with pauses
      return this.splitIntoTurns(response);
    } catch (error) {
      console.error('Agent error:', error);
      return [{
        text: 'I apologize, I encountered an error. Could you try rephrasing your response?',
        pauseAfterMs: 1500
      }];
    }
  }

  private splitIntoTurns(text: string): Turn[] {
    // Split by sentence boundaries and create turns with appropriate pauses
    const sentences = text
      .split(/([.!?]+\s+)/)
      .filter((s: string) => s.trim().length > 0)
      .reduce((acc: string[], s: string, i: number, arr: string[]) => {
        if (i > 0 && /[.!?]/.test(arr[i - 1].charAt(arr[i - 1].length - 1))) {
          return acc;
        }
        if (acc.length > 0 && /[.!?]/.test(acc[acc.length - 1].charAt(acc[acc.length - 1].length - 1))) {
          return acc;
        }
        if (s.match(/[.!?]+/)) {
          return acc;
        }
        return [...acc, s];
      }, []);

    // Clean up sentences
    const cleanSentences = sentences
      .join(' ')
      .split(/([.!?]+)/)
      .reduce((acc: string[], s: string) => {
        if (s.match(/[.!?]+/)) {
          if (acc.length > 0) {
            acc[acc.length - 1] += s;
          }
        } else if (s.trim().length > 0) {
          acc.push(s.trim());
        }
        return acc;
      }, []);

    // Convert to turns with default pauses
    return cleanSentences.map((sentence: string, index: number) => ({
      text: sentence,
      pauseAfterMs: index === cleanSentences.length - 1 ? 2000 : 800 // Longer pause after last sentence
    }));
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
