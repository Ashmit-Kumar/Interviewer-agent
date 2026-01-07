import { Room, RoomEvent, RemoteParticipant, RemoteTrack, Track } from 'livekit-client';
import { deepgramService } from '../speech/deepgramService';
import { elevenLabsService } from '../speech/elevenLabsService';
import { interviewerAgent } from '../ai/interviewerAgent';
import { sessionRepository } from '../../repositories/sessionRepository';
import { livekitConfig } from '../../config/services';

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
    if (track.kind === Track.Kind.Audio && participant.identity === 'candidate') {
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
  const transcriber = deepgramService.createLiveTranscriber(async (transcript) => {
    console.log(`Candidate said: ${transcript}`);

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

  // Get audio stream and pipe to Deepgram
  const mediaStream = track.mediaStream;
  if (mediaStream) {
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      // Create MediaRecorder to capture audio chunks
      const mediaRecorder = new MediaRecorder(mediaStream);
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Convert Blob to Buffer and send to Deepgram
          event.data.arrayBuffer().then(buffer => {
            transcriber.send(Buffer.from(buffer));
          });
        }
      };

      mediaRecorder.start(100); // Capture every 100ms
    }
  }
}

async function speakToCandidate(sessionId: string, room: Room, text: string) {
  try {
    console.log(`AI speaking: ${text}`);

    // Generate speech audio
    const audioBuffer = await elevenLabsService.generateSpeech(text);

    // TODO: Publish audio to LiveKit room
    // This requires creating a LocalAudioTrack from the buffer
    // For now, just log that speech was generated
    console.log(`✓ Speech generated (${audioBuffer.length} bytes)`);

    // Note: Full implementation requires:
    // 1. Converting Buffer to MediaStreamTrack
    // 2. Creating LocalAudioTrack
    // 3. Publishing track to room
  } catch (error) {
    console.error('Failed to speak:', error);
  }
}

// Start the agent
main().catch((error) => {
  console.error('Agent error:', error);
  process.exit(1);
});
