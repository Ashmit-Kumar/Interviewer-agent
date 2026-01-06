import Session, { ISession } from '../models/Session';
import { ApiError } from '../middlewares/errorHandler';

export class SessionRepository {
  async create(sessionData: Partial<ISession>): Promise<ISession> {
    try {
      const session = new Session(sessionData);
      return await session.save();
    } catch (error) {
      throw new ApiError(500, 'Failed to create session');
    }
  }

  async findBySessionId(sessionId: string): Promise<ISession | null> {
    try {
      return await Session.findOne({ sessionId });
    } catch (error) {
      throw new ApiError(500, 'Failed to fetch session');
    }
  }

  async updateCode(sessionId: string, code: string): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        { finalCode: code },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to update code');
    }
  }

  async addTranscript(
    sessionId: string,
    transcript: { role: 'user' | 'assistant'; content: string }
  ): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        {
          $push: {
            transcripts: {
              ...transcript,
              timestamp: new Date(),
            },
          },
        },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to add transcript');
    }
  }

  async endSession(sessionId: string): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        {
          status: 'ended',
          endedAt: new Date(),
        },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to end session');
    }
  }

  async updateEvaluation(
    sessionId: string,
    evaluation: {
      strengths: string[];
      improvements: string[];
      edgeCases: string[];
      nextSteps: string[];
    }
  ): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        {
          status: 'evaluated',
          evaluation: {
            ...evaluation,
            generatedAt: new Date(),
          },
        },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to update evaluation');
    }
  }
}
