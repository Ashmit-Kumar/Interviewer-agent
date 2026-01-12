import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { sessionRepository } from '../repositories/sessionRepository';
import { interviewOrchestrator } from '../services/interview-orchestrator/interviewOrchestrator';
import { evaluationService } from '../services/evaluation/evaluationService';
import { ApiError } from '../middlewares/errorHandler';
// import { vapiConfig } from '../config/services';

export class SessionController {
  startSession = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = uuidv4();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📝 Creating new session: ${sessionId}`);
      console.log(`${'='.repeat(60)}`);

      // Initialize interview orchestrator
      const { question } = await interviewOrchestrator.initializeInterview(sessionId);
      console.log(`✅ Question selected: ${question.title}`);
      // Log the selected questionId if present
      try {
        console.log(`🔖 Selected questionId: ${question.questionId || '(none)'}`);
      } catch (e) {
        console.log('🔖 Selected questionId: (unavailable)');
      }

      // Create session in MongoDB
      const createdSession = await sessionRepository.create({
        sessionId,
        status: 'active',
        questionsAsked: [question.title],
        // Persist the questionId both as top-level and in metadata for compatibility
        questionId: question.questionId,
        metadata: { questionId: question.questionId },
        finalCode: '',
        transcripts: [],
      });
      
      console.log(`✅ Session created in MongoDB:`);
      console.log(`   SessionId: ${createdSession.sessionId}`);
      console.log(`   Status: ${createdSession.status}`);
      console.log(`   Questions: ${createdSession.questionsAsked.length}`);
      // Explicitly log stored metadata (helps verify questionId persisted)
      try {
        console.log(`   Stored metadata.questionId: ${createdSession.metadata?.questionId ?? '(none)'}`);
      } catch (e) {
        console.log('   Stored metadata: (unavailable)');
      }
      // console.log(`   Database: ${createdSession.constructor.modelName}`);
      console.log(`${'='.repeat(60)}\n`);

      // Return session data (frontend will call /api/livekit/room separately)
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
        },
      });
    } catch (error) {
      console.error(`❌ Failed to create session:`, error);
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

  updateEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;

      const body = req.body || {};

      if (!body || Object.keys(body).length === 0) {
        throw new ApiError(400, 'Evaluation payload is required');
      }

      // Build sanitized data object to update
      const data: any = {};

      // Accept either full payload or nested `evaluation` key
      const incomingEval = body.evaluation || (body.strengths || body.improvements || body.edgeCases || body.nextSteps ? body : null);
      if (incomingEval) {
        data.evaluation = {
          strengths: Array.isArray(incomingEval.strengths) ? incomingEval.strengths : [],
          improvements: Array.isArray(incomingEval.improvements) ? incomingEval.improvements : [],
          edgeCases: Array.isArray(incomingEval.edgeCases) ? incomingEval.edgeCases : [],
          nextSteps: Array.isArray(incomingEval.nextSteps) ? incomingEval.nextSteps : []
        };
      }

      // Sanitize transcripts if provided
      if (Array.isArray(body.transcripts)) {
        data.transcripts = body.transcripts
          .map((t: any) => {
            const content = (t.content || '').toString().trim();
            if (!content) return null;
            const role = (t.role === 'user') ? 'user' : 'assistant';
            return { role, content, timestamp: t.timestamp ? new Date(t.timestamp) : undefined };
          })
          .filter(Boolean);
      }

      if (body.finalCode) data.finalCode = String(body.finalCode || '');

      // Ensure final status is evaluated
      data.status = 'evaluated';

      const session = await sessionRepository.updateEvaluation(sessionId, data);

      if (!session) {
        throw new ApiError(404, 'Session not found');
      }

      res.json({ success: true, data: { sessionId } });
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
