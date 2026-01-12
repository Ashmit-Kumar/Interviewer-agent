import { Request, Response } from 'express';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/services';
import { sessionRepository } from '../repositories/sessionRepository';

export class LiveKitController {
  private roomService: RoomServiceClient;

  constructor() {
    this.roomService = new RoomServiceClient(
      livekitConfig.host,
      livekitConfig.apiKey,
      livekitConfig.apiSecret
    );
  }

  async createRoom(req: Request, res: Response) {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      const roomName = `interview-${sessionId}`;

      // Fetch session to include questionId in room metadata if available
      let metaObj: any = { sessionId };
      try {
        const session = await sessionRepository.findBySessionId(sessionId);
        if (session) {
          metaObj.questionId = session.questionId || session.metadata?.questionId;
        }
      } catch (e) {
        console.warn('Could not load session to enrich room metadata', e);
      }

      // Create room via RoomService with metadata for Python agent
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 3600, // 1 hour
        maxParticipants: 2,
        metadata: JSON.stringify(metaObj), // Add metadata here for agent
      });

      console.log(`✓ LiveKit room created: ${roomName}`);
      console.log(`  Room metadata: ${JSON.stringify(metaObj)}`);

      // Generate candidate token (no metadata needed here)
      const candidateToken = await this.generateToken(roomName, 'candidate');

      // Validate token before sending
      if (!candidateToken || candidateToken.length === 0) {
        throw new Error('Failed to generate LiveKit token');
      }

      console.log('✅ Generated candidate token:', {
        roomName,
        tokenLength: candidateToken.length,
        tokenPreview: candidateToken.substring(0, 30) + '...',
        wsUrl: livekitConfig.wsUrl,
      });

      // Note: Python agent will auto-dispatch when participant joins
      // No need to manually spawn agent process

      res.json({
        success: true,
        data: {
          roomName,
          candidateToken,
          wsUrl: livekitConfig.wsUrl,
        },
      });
    } catch (error) {
      console.error('Failed to create room:', error);
      res.status(500).json({ error: 'Failed to create interview room' });
    }
  }

  private async generateToken(roomName: string, identity: string): Promise<string> {
    const at = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, {
      identity,
    });
    
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    return await at.toJwt();
  }

  async endRoom(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const roomName = `interview-${sessionId}`;

      // Delete room (agent will automatically disconnect)
      await this.roomService.deleteRoom(roomName);
      console.log(`✓ LiveKit room deleted: ${roomName}`);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to end room:', error);
      res.status(500).json({ error: 'Failed to end room' });
    }
  }
}

export const livekitController = new LiveKitController();
