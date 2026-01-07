import Groq from 'groq-sdk';
import { groqConfig } from '../../config/services';

export class EvaluationService {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: groqConfig.apiKey });
  }

  async evaluateInterview(
    code: string,
    transcripts: any[],
    questionsAsked: string[]
  ): Promise<any> {
    try {
      const prompt = this.buildEvaluationPrompt(code, transcripts, questionsAsked);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert technical interviewer providing constructive feedback on coding interviews.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: 'llama-3.3-70b-versatile', // Updated to supported model
        temperature: 0.3,
        max_tokens: 2000,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from LLM');
      }

      return this.parseEvaluation(response);
    } catch (error) {
      console.error('Evaluation service error:', error);
      throw new Error('Failed to generate evaluation');
    }
  }

  private buildEvaluationPrompt(
    code: string,
    transcripts: any[],
    questionsAsked: string[]
  ): string {
    const transcriptText = transcripts
      .map((t) => `${t.role}: ${t.text}`)
      .join('\n');

    return `
You are evaluating a coding interview. Analyze the candidate's performance.

**Questions Asked:**
${questionsAsked.map((q, i) => `${i + 1}. ${q}`).join('\n')}

**Code Submitted:**
\`\`\`
${code || 'No code submitted'}
\`\`\`

**Interview Transcript:**
${transcriptText || 'No transcript available'}

**Provide evaluation in JSON format ONLY:**

{
  "strengths": ["strength1", "strength2", "strength3"],
  "improvements": ["improvement1", "improvement2", "improvement3"],
  "missingEdgeCases": ["case1", "case2", "case3"],
  "nextSteps": ["step1", "step2", "step3"]
}

Be specific and actionable. Return ONLY valid JSON.
    `.trim();
  }

  private parseEvaluation(response: string): any {
    try {
      // Remove markdown code blocks if present
      let jsonString = response.trim();
      jsonString = jsonString.replace(/```json\s*/g, '');
      jsonString = jsonString.replace(/```\s*/g, '');
      
      // Try to extract JSON from response
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate structure
        return {
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ['Participated in the interview'],
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements : ['Continue practicing'],
          missingEdgeCases: Array.isArray(parsed.missingEdgeCases) ? parsed.missingEdgeCases : [],
          nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : ['Keep coding regularly'],
        };
      }

      // Fallback: parse as plain text
      return {
        strengths: ['Participated in the interview'],
        improvements: ['Response parsing failed - manual review needed'],
        missingEdgeCases: [],
        nextSteps: ['Review the raw feedback'],
        rawFeedback: response,
      };
    } catch (error) {
      console.error('Failed to parse evaluation:', error);
      return {
        strengths: ['Completed the interview'],
        improvements: ['Failed to parse evaluation - please review manually'],
        missingEdgeCases: [],
        nextSteps: ['Keep practicing'],
        rawFeedback: response,
      };
    }
  }
}

// Export singleton instance
export const evaluationService = new EvaluationService();
