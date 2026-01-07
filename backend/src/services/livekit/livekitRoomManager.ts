import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { livekitConfig } from '../../config/services';

export class LiveKitRoomManager {
  private roomService: RoomServiceClient;

  constructor() {
    this.roomService = new RoomServiceClient(
      livekitConfig.wsUrl,
      livekitConfig.apiKey,
      livekitConfig.apiSecret
    );
  }

  async createRoom(sessionId: string): Promise<string> {
    const roomName = `interview-${sessionId}`;
    
    try {
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: 3600, // 1 hour
        maxParticipants: 2, // Candidate + AI
      });
      
      console.log(`✓ LiveKit room created: ${roomName}`);
      return roomName;
    } catch (error) {
      console.error('Failed to create LiveKit room:', error);
      throw new Error('Failed to create interview room');
    }
  }

  generateToken(roomName: string, participantName: string, canPublish: boolean = true): string {
    const token = new AccessToken(
      livekitConfig.apiKey,
      livekitConfig.apiSecret,
      {
        identity: participantName,
      }
    );

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
    });

    return token.toJwt();
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName);
      console.log(`✓ LiveKit room deleted: ${roomName}`);
    } catch (error) {
      console.error('Failed to delete LiveKit room:', error);
    }
  }
}

export const livekitRoomManager = new LiveKitRoomManager();
