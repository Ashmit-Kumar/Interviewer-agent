import mongoose from 'mongoose';
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
        { $set: { finalCode: code } },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to update code');
    }
  }

  async endSession(sessionId: string): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        { $set: { status: 'ended', endedAt: new Date() } },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to end session');
    }
  }

  async updateEvaluation(sessionId: string, evaluation: any): Promise<ISession | null> {
    try {
      return await Session.findOneAndUpdate(
        { sessionId },
        { $set: { evaluation } },
        { new: true }
      );
    } catch (error) {
      throw new ApiError(500, 'Failed to update evaluation');
    }
  }

  async addTranscript(sessionId: string, transcript: any): Promise<void> {
    try {
      // Check if MongoDB is connected
      if (mongoose.connection.readyState !== 1) {
        throw new Error(`MongoDB not connected. State: ${mongoose.connection.readyState}`);
      }

      const result = await Session.findOneAndUpdate(
        { sessionId },
        { $push: { transcripts: transcript } },
        { new: true }
      );
      
      if (!result) {
        throw new Error(`Session not found: ${sessionId}`);
      }
    } catch (error) {
      console.error('[SessionRepository] Error adding transcript:', error);
      throw new ApiError(500, 'Failed to add transcript');
    }
  }
}

export const sessionRepository = new SessionRepository();