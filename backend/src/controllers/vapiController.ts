import { Request, Response, NextFunction } from 'express';
import { SessionRepository } from '../repositories/sessionRepository';
import { InterviewOrchestrator } from '../services/interview-orchestrator/interviewOrchestrator';
import { ApiError } from '../middlewares/errorHandler';

export class VapiController {
  private sessionRepo: SessionRepository;
  private orchestrator: InterviewOrchestrator;

  constructor() {
    this.sessionRepo = new SessionRepository();
    this.orchestrator = new InterviewOrchestrator();
  }

  handleWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message } = req.body;

      // Vapi webhook events
      if (message?.type === 'function-call') {
        return this.handleFunctionCall(req, res, next);
      }

      if (message?.type === 'transcript') {
        return this.handleTranscript(req, res, next);
      }

      if (message?.type === 'end-of-call-report') {
        return this.handleEndOfCall(req, res, next);
      }

      // Acknowledge other events
      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  };

  private handleFunctionCall = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { functionCall, call } = req.body;
      const sessionId = call?.metadata?.sessionId;

      if (!sessionId) {
        throw new ApiError(400, 'Session ID not found in call metadata');
      }

      const functionName = functionCall?.name;
      const parameters = functionCall?.parameters || {};

      let result: any;

      switch (functionName) {
        case 'get_next_question':
          result = await this.orchestrator.getNextQuestion(sessionId);
          break;

        case 'record_explanation':
          await this.sessionRepo.addTranscript(sessionId, {
            role: 'user',
            content: parameters.explanation || '',
          });
          result = { success: true, message: 'Explanation recorded' };
          break;

        case 'ask_followup':
          result = await this.orchestrator.handleFollowUp(sessionId, parameters.topic || '');
          break;

        case 'end_interview':
          await this.orchestrator.completeInterview(sessionId);
          result = { success: true, message: 'Interview ending' };
          break;

        default:
          throw new ApiError(400, `Unknown function: ${functionName}`);
      }

      res.json({
        result,
      });
    } catch (error) {
      next(error);
    }
  };

  private handleTranscript = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transcript, call } = req.body;
      const sessionId = call?.metadata?.sessionId;

      if (sessionId && transcript) {
        await this.sessionRepo.addTranscript(sessionId, {
          role: transcript.role === 'assistant' ? 'assistant' : 'user',
          content: transcript.text || '',
        });
      }

      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  };

  private handleEndOfCall = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { call } = req.body;
      const sessionId = call?.metadata?.sessionId;

      if (sessionId) {
        // Ensure session is marked as ended
        await this.sessionRepo.endSession(sessionId);
        await this.orchestrator.completeInterview(sessionId);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  };
}
