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

  // Stream audio frames directly to Deepgram
  // LiveKit provides raw PCM audio data through the track
  try {
    // Attach audio receiver to get raw frames
    const mediaStream = track.mediaStream;
    if (!mediaStream) {
      console.error('❌ No media stream available from track');
      return;
    }

    console.log('✅ Media stream obtained, creating audio context');
    
    // Use Web Audio API (available in Node via node-web-audio-api or similar)
    // For now, we'll use a simpler approach with the track's MediaStream
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.error('❌ No audio track found in media stream');
      return;
    }

    console.log('✅ Audio track obtained, setting up processor');

    // Create a MediaStreamAudioSourceNode and process the audio
    // Since we're in Node.js, we need to handle this differently
    // We'll use the track's data events if available, or poll for frames
    
    // LiveKit RemoteTrack provides access to raw audio data
    // Stream it directly to Deepgram
    let frameCount = 0;
    const audioContext = new (require('web-audio-api').AudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event: any) => {
      const inputData = event.inputBuffer.getChannelData(0);
      
      // Convert Float32Array to Int16Array (PCM16)
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Send to Deepgram (as ArrayBuffer for proper typing)
      transcriber.send(pcm16.buffer as ArrayBuffer);
      
      frameCount++;
      if (frameCount % 50 === 0) {
        console.log(`📊 Processed ${frameCount} audio frames`);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    console.log('✅ Audio pipeline established: LiveKit → Deepgram');
    
  } catch (error) {
    console.error('❌ Failed to set up audio pipeline:', error);
    console.error('Error details:', error);
  }
}

async function speakToCandidate(_sessionId: string, _room: Room, text: string) {
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
