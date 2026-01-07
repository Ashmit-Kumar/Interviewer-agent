import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sessionRepository } from '../repositories/sessionRepository';
import { interviewOrchestrator } from '../services/interview-orchestrator/interviewOrchestrator';
import { evaluationService } from '../services/evaluation/evaluationService';
import { ApiError } from '../middlewares/errorHandler';
import { vapiConfig } from '../config/services';

export class SessionController {
  startSession = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = uuidv4();

      // Initialize interview orchestrator
      const { question, agentContext } = await interviewOrchestrator.initializeInterview(sessionId);

      // Create session in MongoDB
      await sessionRepository.create({
        sessionId,
        status: 'active',
        questionsAsked: [question.title],
        finalCode: '',
        transcripts: [],
      });

      // Return session data with Vapi configuration
      res.status(201).json({
        success: true,
        data: {
          sessionId,
          question: {
            title: question.title,
            difficulty: question.difficulty,
            description: question.description,
            constraints: question.constraints,
          },
          vapiConfig: {
            publicKey: vapiConfig.publicKey,
            agentId: vapiConfig.agentId,
            metadata: {
              sessionId,
              agentContext,
            },
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const { code } = req.body;

      if (!code) {
        throw new ApiError(400, 'Code is required');
      }

      const session = await sessionRepository.updateCode(sessionId, code);

      if (!session) {
        throw new ApiError(404, 'Session not found');
      }

      res.json({
        success: true,
        message: 'Code updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  endSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;

      // End session in database
      const session = await sessionRepository.endSession(sessionId);

      if (!session) {
        throw new ApiError(404, 'Session not found');
      }

      // Complete interview in orchestrator (cleanup Redis)
      await interviewOrchestrator.completeInterview(sessionId);

      // Trigger evaluation asynchronously
      this.runEvaluation(sessionId).catch((error) => {
        console.error('Background evaluation failed:', error);
      });

      res.json({
        success: true,
        message: 'Interview ended successfully',
        data: { sessionId },
      });
    } catch (error) {
      next(error);
    }
  };

  getResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sessionId } = req.params;

      const session = await sessionRepository.findBySessionId(sessionId);

      if (!session) {
        throw new ApiError(404, 'Session not found');
      }

      // If evaluation is still pending, return status
      if (session.status === 'ended' && !session.evaluation) {
        res.json({
          success: true,
          data: {
            status: 'processing',
            message: 'Evaluation in progress',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          sessionId: session.sessionId,
          questionsAsked: session.questionsAsked,
          finalCode: session.finalCode,
          transcripts: session.transcripts,
          evaluation: session.evaluation,
          status: session.status,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  private async runEvaluation(sessionId: string): Promise<void> {
    try {
      const session = await sessionRepository.findBySessionId(sessionId);
      if (!session) return;

      const evaluation = await evaluationService.evaluateInterview(
        session.finalCode,
        session.transcripts,
        session.questionsAsked
      );

      await sessionRepository.updateEvaluation(sessionId, evaluation);

      console.log(`✓ Evaluation completed for session ${sessionId}`);
      console.log('--- Evaluation Result ---');
      console.log(JSON.stringify(evaluation, null, 2));
      console.log('------------------------');
    } catch (error) {
      console.error(`Failed to evaluate session ${sessionId}:`, error);
    }
  }
}

export const sessionController = new SessionController();
