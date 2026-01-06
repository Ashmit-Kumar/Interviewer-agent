import Groq from 'groq-sdk';
import { groqConfig } from '../../config/services';
import { EvaluationResult } from '../../models/types';

export class EvaluationService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: groqConfig.apiKey });
  }

  async evaluateInterview(
    code: string,
    transcripts: Array<{ role: string; content: string; timestamp: Date }>,
    questions: string[]
  ): Promise<EvaluationResult> {
    try {
      const prompt = this.buildEvaluationPrompt(code, transcripts, questions);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an expert technical interviewer evaluating a coding interview session. 
Provide structured, constructive feedback in JSON format with these exact fields:
- strengths: array of strings describing what the candidate did well
- improvements: array of strings suggesting areas for improvement  
- edgeCases: array of strings listing edge cases the candidate missed
- nextSteps: array of strings recommending next preparation steps

Be specific, actionable, and encouraging. Focus on both technical skills and communication.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: groqConfig.model,
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const result = completion.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No evaluation generated');
      }

      const evaluation = JSON.parse(result);
      return this.validateEvaluation(evaluation);
    } catch (error) {
      console.error('Evaluation service error:', error);
      throw new Error('Failed to generate evaluation');
    }
  }

  private buildEvaluationPrompt(
    code: string,
    transcripts: Array<{ role: string; content: string; timestamp: Date }>,
    questions: string[]
  ): string {
    const transcriptText = transcripts
      .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
      .join('\n');

    return `
## Interview Session Evaluation

### Questions Discussed:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

### Final Code Submitted:
\`\`\`javascript
${code || '// No code submitted'}
\`\`\`

### Interview Transcript:
${transcriptText || 'No transcript available'}

---

Evaluate this interview session comprehensively. Consider:
1. Code quality, correctness, and efficiency
2. Problem-solving approach and thought process
3. Communication clarity and explanation quality
4. Edge case handling and testing mindset
5. Time/space complexity awareness

Provide feedback in the specified JSON format.
    `.trim();
  }

  private validateEvaluation(evaluation: any): EvaluationResult {
    return {
      strengths: Array.isArray(evaluation.strengths) ? evaluation.strengths : [],
      improvements: Array.isArray(evaluation.improvements) ? evaluation.improvements : [],
      edgeCases: Array.isArray(evaluation.edgeCases) ? evaluation.edgeCases : [],
      nextSteps: Array.isArray(evaluation.nextSteps) ? evaluation.nextSteps : [],
    };
  }
}
