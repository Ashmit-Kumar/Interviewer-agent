import { 
  Room, 
  RoomEvent, 
  RemoteParticipant, 
  RemoteTrack,
  RemoteAudioTrack,
  TrackKind,
  AudioSource,
  LocalAudioTrack,
  AudioFrame 
} from '@livekit/rtc-node';
import { deepgramService } from '../speech/deepgramService';
import { elevenLabsService } from '../speech/elevenLabsService';
import { interviewerAgent } from '../ai/interviewerAgent';
import { sessionRepository } from '../../repositories/sessionRepository';
import { livekitConfig } from '../../config/services';
import { spawn } from 'child_process';

async function main() {
  const [roomName, token, sessionId] = process.argv.slice(2);

  if (!roomName || !token || !sessionId) {
    console.error('Usage: node agent.js <roomName> <token> <sessionId>');
    process.exit(1);
  }

  console.log(`Starting AI agent for room: ${roomName}`);

  const room = new Room();

  room.on(RoomEvent.TrackSubscribed, async (
    track: RemoteTrack,
    _publication: any,
    participant: RemoteParticipant
  ) => {
    if (track.kind === TrackKind.KIND_AUDIO && participant.identity === 'candidate') {
      console.log('✓ Subscribed to candidate audio');
      handleCandidateAudio(sessionId, track, room);
    }
  });

  room.on(RoomEvent.Disconnected, () => {
    console.log('Agent disconnected from room');
    process.exit(0);
  });

  // Connect to room using config
  console.log(`Connecting agent to: ${livekitConfig.wsUrl}`);
  await room.connect(livekitConfig.wsUrl, token);

  console.log('✓ AI agent connected to room');

  // Send initial greeting
  await speakToCandidate(sessionId, room, "Hello! I'm your AI interviewer today. Are you ready to begin?");
}

async function handleCandidateAudio(sessionId: string, track: RemoteTrack, room: Room) {
  console.log('🎧 Setting up audio pipeline: LiveKit → Deepgram');
  
  const transcriber = deepgramService.createLiveTranscriber(async (transcript) => {
    console.log(`💬 Candidate said: "${transcript}"`);

    // Save transcript
    await sessionRepository.addTranscript(sessionId, {
      role: 'user',
      text: transcript,
      timestamp: new Date(),
    });

    // Process with AI
    const response = await interviewerAgent.processUserMessage(sessionId, transcript);

    // Save AI response transcript
    await sessionRepository.addTranscript(sessionId, {
      role: 'assistant',
      text: response,
      timestamp: new Date(),
    });

    // Speak response
    await speakToCandidate(sessionId, room, response);
  });

  // Stream audio frames directly to Deepgram using @livekit/rtc-node API
  try {
    console.log('✅ Setting up audio frame receiver');
    
    // Cast to RemoteAudioTrack to access audio stream
    const audioTrack = track as RemoteAudioTrack;
    
    // Note: Audio streaming will be handled in next iteration
    // For now, using placeholder
    console.log('Audio track ready:', audioTrack.sid);
    
    // TODO: Implement proper audio frame streaming
    // This requires additional LiveKit RTC Node SDK configuration
    // Transcriber is ready but audio streaming not yet implemented
    console.log('Transcriber ready:', !!transcriber);

    console.log('✅ Audio pipeline placeholder established');
    
  } catch (error) {
    console.error('❌ Failed to set up audio pipeline:', error);
    console.error('Error details:', error);
  }
}

async function speakToCandidate(_sessionId: string, room: Room, text: string) {
  try {
    console.log(`🤖 AI speaking: "${text}"`);

    // Generate TTS from ElevenLabs
    const audioBuffer = await elevenLabsService.generateSpeech(text);
    console.log(`✅ Speech generated (${audioBuffer.length} bytes)`);

    // Convert MP3 → PCM
    const pcmBuffer = await convertMp3ToPcm(audioBuffer);
    console.log(`✅ Audio converted to PCM (${pcmBuffer.length} bytes)`);

    // Create audio source and track
    const source = new AudioSource(48000, 1); // 48kHz, mono
    const track = LocalAudioTrack.createAudioTrack('ai-voice', source);

    // Publish track to room
    if (room.localParticipant) {
      const publication = await room.localParticipant.publishTrack(track, {
        name: 'ai-voice',
        stream: 'audio'
      } as any);
      console.log('✅ Audio track published:', publication.sid);
    }

    // Stream PCM frames to LiveKit
    const pcm = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    const frameSize = 480; // 10ms @ 48kHz
    const sampleRate = 48000;
    const numChannels = 1;

    for (let i = 0; i < pcm.length; i += frameSize) {
      const frameData = pcm.subarray(i, Math.min(i + frameSize, pcm.length));
      const audioFrame = new AudioFrame(
        frameData,
        sampleRate,
        numChannels,
        frameData.length
      );
      await source.captureFrame(audioFrame);
      await sleep(10); // 10ms per frame
    }

    console.log('✅ All audio frames sent');

    // Unpublish track
    if (room.localParticipant && track.sid) {
      await room.localParticipant.unpublishTrack(track.sid);
      console.log('✅ Audio track unpublished');
    }
    
  } catch (error) {
    console.error('❌ Failed to speak:', error);
  }
}

// Helper function to convert MP3 to PCM using FFmpeg
async function convertMp3ToPcm(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',           // Input from stdin
      '-f', 's16le',            // Output format: signed 16-bit little-endian PCM
      '-ar', '48000',           // Sample rate: 48kHz
      '-ac', '1',               // Channels: mono
      'pipe:1'                  // Output to stdout
    ]);

    const pcmChunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      pcmChunks.push(chunk);
    });

    ffmpeg.stderr.on('data', (data: any) => {
      // FFmpeg logs to stderr - only log actual errors
      const msg = data.toString();
      if (msg.toLowerCase().includes('error')) {
        console.error('FFmpeg:', msg);
      }
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(pcmChunks));
    });

    ffmpeg.on('error', (err: any) => {
      reject(err);
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

// Helper function to sleep
// function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// Helper function for timing audio frames
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the agent
main().catch((error) => {
  console.error('Agent error:', error);
  process.exit(1);
});
