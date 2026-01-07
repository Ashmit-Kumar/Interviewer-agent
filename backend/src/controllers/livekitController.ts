import { Request, Response } from 'express';
import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { livekitConfig } from '../config/services';
import { spawn } from 'child_process';

export class LiveKitController {
  private roomService: RoomServiceClient;
  private agentProcesses: Map<string, any> = new Map();

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

      // Generate candidate token
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

      // Generate AI token for agent process
      const aiToken = await this.generateToken(roomName, 'ai-interviewer');

      // Start AI agent process
      this.startAgentProcess(sessionId, roomName, aiToken);

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

  private startAgentProcess(sessionId: string, roomName: string, token: string) {
    try {
      // Spawn separate Node.js process for AI agent using ts-node
      // Use node with ts-node/register for Windows compatibility
      const agentProcess = spawn(process.execPath, [
        '-r',
        'ts-node/register',
        'src/services/livekit/agent.ts',
        roomName,
        token,
        sessionId,
      ], {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: false,
      });

      agentProcess.stdout.on('data', (data) => {
        console.log(`[Agent ${sessionId}]: ${data}`);
      });

      agentProcess.stderr.on('data', (data) => {
        console.error(`[Agent ${sessionId} Error]: ${data}`);
      });

      agentProcess.on('close', (code) => {
        console.log(`Agent process ${sessionId} exited with code ${code}`);
        this.agentProcesses.delete(sessionId);
      });

      this.agentProcesses.set(sessionId, agentProcess);
      console.log(`✓ AI agent process started for session ${sessionId}`);
    } catch (error) {
      console.error('Failed to start agent process:', error);
    }
  }

  async endRoom(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const roomName = `interview-${sessionId}`;

      // Kill agent process if running
      const agentProcess = this.agentProcesses.get(sessionId);
      if (agentProcess) {
        agentProcess.kill();
        this.agentProcesses.delete(sessionId);
      }

      // Delete room
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
