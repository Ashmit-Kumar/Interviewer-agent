import { Request, Response } from 'express';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/services';

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

      // Create room via RoomService
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 3600, // 1 hour
        maxParticipants: 2,
      });

      console.log(`✓ LiveKit room created: ${roomName}`);

      // Generate candidate token with session metadata (as JSON for Python agent)
      const candidateToken = await this.generateToken(roomName, 'candidate', sessionId);

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

  private async generateToken(roomName: string, identity: string, sessionId?: string): Promise<string> {
    const at = new AccessToken(livekitConfig.apiKey, livekitConfig.apiSecret, {
      identity,
      // Send sessionId as JSON metadata for Python agent
      ...(sessionId && { metadata: JSON.stringify({ sessionId }) }),
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
