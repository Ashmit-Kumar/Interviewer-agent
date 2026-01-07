import { 
  Request,
  Response,
  // NextFunction
 } from 'express';
import { interviewOrchestrator } from '../services/interview-orchestrator/interviewOrchestrator';
import { sessionRepository } from '../repositories/sessionRepository';

export class VapiController {
  async handleWebhook(req: Request, res: Response) {
    try {
      console.log('🔔 Vapi webhook received:', JSON.stringify(req.body, null, 2));
      
      const { message } = req.body;

      if (!message) {
        console.error('❌ No message in webhook payload');
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      console.log('📋 Message type:', message.type);

      // Handle function calls
      if (message.type === 'function-call') {
        const { functionCall } = message;
        console.log('🔧 Function call:', functionCall.name);
        console.log('📦 Parameters:', JSON.stringify(functionCall.parameters, null, 2));

        let result;
        switch (functionCall.name) {
          case 'get_next_question':
            result = await this.handleGetNextQuestion(functionCall.parameters);
            break;
          case 'record_explanation':
            result = await this.handleRecordExplanation(functionCall.parameters);
            break;
          case 'ask_followup':
            result = await this.handleAskFollowup(functionCall.parameters);
            break;
          case 'end_interview':
            result = await this.handleEndInterview(functionCall.parameters);
            break;
          default:
            console.error('❌ Unknown function:', functionCall.name);
            return res.status(400).json({ error: 'Unknown function' });
        }

        console.log('✅ Function result:', JSON.stringify(result, null, 2));
        return res.json({ result });
      }

      // Handle transcripts
      if (message.type === 'transcript') {
        console.log('📝 Transcript:', message.transcript);
        await this.saveTranscript(message);
        return res.json({ success: true });
      }

      // Handle end-of-call
      if (message.type === 'end-of-call-report') {
        console.log('📞 Call ended');
        await this.handleCallEnd(message);
        return res.json({ success: true });
      }

      console.log('ℹ️ Unhandled message type:', message.type);
      res.json({ success: true });
    } catch (error) {
      console.error('💥 Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Handler: Get next question
  private async handleGetNextQuestion(params: { sessionId: string }) {
    const { sessionId } = params;
    const result = await interviewOrchestrator.getNextQuestion(sessionId);
    
    if (!result) {
      return {
        success: false,
        message: 'No more questions available',
      };
    }

    return {
      question: result.question.title,
      description: result.question.description,
      difficulty: result.question.difficulty,
      constraints: result.question.constraints,
    };
  }

  // Handler: Record explanation
  private async handleRecordExplanation(params: { sessionId: string; explanation: string }) {
    const { sessionId, explanation } = params;
    
    const session = await sessionRepository.findBySessionId(sessionId);
    if (session) {
      await sessionRepository.addTranscript(sessionId, {
        role: 'assistant',
        text: `Candidate explained: ${explanation}`,
        timestamp: new Date(),
        // { new: true },
      });
    }
    
    return {
      success: true,
      message: 'Explanation recorded',
    };
  }

  // Handler: Ask follow-up
  private async handleAskFollowup(params: { sessionId: string; topic: string }) {
    const { sessionId, topic } = params;
    const context = await interviewOrchestrator.handleFollowUp(sessionId, topic);
    
    return {
      context,
      suggestion: `Probe deeper into ${topic}`,
    };
  }

  // Handler: End interview
  private async handleEndInterview(params: { sessionId: string }) {
    const { sessionId } = params;
    
    await interviewOrchestrator.completeInterview(sessionId);
    // await sessionRepository.update(sessionId, {
    //   status: 'ended',
    //   endedAt: new Date(),
    // });
    await sessionRepository.endSession(sessionId);
    
    return {
      success: true,
      message: 'Interview ended successfully. Thank you for participating!',
      action: 'end_call',
    };
  }

  // Helper: Save transcript
  private async saveTranscript(message: any) {
    const { sessionId, transcript, role, transcriptType } = message;
    
    if (transcriptType !== 'final') {
      return;
    }
    
    await sessionRepository.addTranscript(sessionId, {
      role: role || 'user',
      text: transcript,
      timestamp: new Date(),
    });
  }

  // Helper: Handle call end
  private async handleCallEnd(message: any) {
    const { sessionId } = message;
    
    if (sessionId) {
      await interviewOrchestrator.completeInterview(sessionId);
      // await sessionRepository.update(sessionId, {
      //   status: 'ended',
      //   endedAt: new Date(),
      // });
      await sessionRepository.endSession(sessionId);
    }
  }
}
