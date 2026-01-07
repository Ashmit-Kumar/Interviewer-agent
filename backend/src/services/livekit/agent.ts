import { 
  Room, 
  RoomEvent, 
  RemoteParticipant, 
  RemoteTrack,
  RemoteAudioTrack,
  RemoteTrackPublication,
  TrackKind,
  AudioSource,
  LocalAudioTrack,
  AudioFrame,
  AudioStream
} from '@livekit/rtc-node';
import { ElevenLabsClient } from 'elevenlabs';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { interviewerAgent } from '../ai/interviewerAgent';
import { sessionRepository } from '../../repositories/sessionRepository';
import { livekitConfig } from '../../config/services';

// Global audio track management (persistent across speech calls)
let persistentAudioSource: AudioSource | null = null;
let persistentAudioTrack: LocalAudioTrack | null = null;
// let agentSpeaking = false;
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
    _publication: RemoteTrackPublication,
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
  console.log('🎧 Setting up audio pipeline: LiveKit → Deepgram (PCM format)');
  
  // Create Deepgram client
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  
  // Create live transcription connection with proper PCM settings
  const connection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    encoding: 'linear16',
    sample_rate: 48000,
    channels: 1,
    smart_format: true,
    interim_results: true,
    endpointing: 300
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('✅ Deepgram WebSocket CONNECTED');
  });

  connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const transcript = data.channel?.alternatives[0]?.transcript;
    
    if (transcript && transcript.trim().length > 0) {
      console.log(`📝 INTERIM: "${transcript}"`);
      
      // Only process final transcripts
      if (data.is_final) {
        console.log(`💬 FINAL: "${transcript}"`);

        try {
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
        } catch (processError) {
          console.error('❌ Error processing transcript:', processError);
        }
      }
    }
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('🔴 Deepgram connection closed');
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    console.error('❌ Deepgram error:', error);
  });

  try {
    const audioTrack = track as RemoteAudioTrack;
    console.log('🎤 Audio track ready:', {
      sid: audioTrack.sid,
      trackKind: audioTrack.kind
    });
    
    // Create AudioStream from RemoteAudioTrack with explicit sample rate
    const audioStream = new AudioStream(audioTrack, 48000);
    console.log('✅ AudioStream created at 48kHz sample rate');
    
    let frameCount = 0;
    let bytesSent = 0;
    let isStreaming = true;
    
    // Process audio frames and send to Deepgram
    (async () => {
      try {
        console.log('🎯 Starting to stream audio frames to Deepgram...');
        
        // Iterate through audio frames from LiveKit
        // AudioStream is iterable despite type issues
        const frameIterator = audioStream as unknown as AsyncIterable<AudioFrame>;
        
        for await (const frame of frameIterator) {
          if (!isStreaming) {
            console.log('✅ Audio streaming stopped');
            connection.finish();
            break;
          }

          try {
            frameCount++;
            
            // Get audio data from frame
            if (frame && frame.data) {
              const frameData = frame.data;
              bytesSent += frameData.length;
              
              // Convert Int16Array to ArrayBuffer for Deepgram
              const arrayBuffer = frameData.buffer.slice(
                frameData.byteOffset,
                frameData.byteOffset + frameData.byteLength
              );
              connection.send(arrayBuffer);
              
              // Log progress every 100 frames (~2 seconds at 48kHz, 20ms frames)
              if (frameCount % 100 === 0) {
                const durationSecs = (frameCount * 20) / 1000;
                console.log(`📊 Sent: ${frameCount} frames, ${bytesSent} bytes, ~${durationSecs.toFixed(1)}s`);
              }
            }
          } catch (frameError) {
            console.error('❌ Error sending frame:', frameError);
            break;
          }
        }
        
        console.log(`✅ Audio stream ended: ${frameCount} frames, ${bytesSent} bytes sent`);
        connection.finish();
      } catch (streamError) {
        console.error('❌ Audio streaming error:', streamError);
        isStreaming = false;
        connection.finish();
      }
    })();

    console.log('✅ Audio pipeline established: LiveKit (48kHz PCM) → Deepgram');
    console.log('🎙️  Listening for candidate audio...');
    
  } catch (error) {
    console.error('❌ Failed to set up audio pipeline:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'N/A');
  }
}

async function speakToCandidate(_sessionId: string, room: Room, text: string) {
  try {
    console.log(`🤖 AI speaking: "${text}"`);

    if (!room.localParticipant) {
      throw new Error('Local participant not available');
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
    }

    const elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY
    });

    console.log('🎵 Generating speech with ElevenLabs...');
    
    // Generate audio stream from ElevenLabs
    const audioStream = await elevenlabs.textToSpeech.convertAsStream(
      process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb',
      {
        text: text,
        model_id: 'eleven_flash_v2_5',
        output_format: 'pcm_16000'
      }
    );

    // Create or reuse persistent audio source/track
    if (!persistentAudioSource || !persistentAudioTrack) {
      console.log('🎙️ Creating persistent audio track...');
      persistentAudioSource = new AudioSource(16000, 1);
      persistentAudioTrack = LocalAudioTrack.createAudioTrack('agent-voice', persistentAudioSource);
      
      // Publish track (LiveKit SDK requires options parameter)
      const opts = {};
      await room.localParticipant.publishTrack(persistentAudioTrack, opts as Parameters<typeof room.localParticipant.publishTrack>[1]);
      console.log('✅ Persistent audio track published');
    }

    // Stream audio data to LiveKit
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }

    const audioBuffer = Buffer.concat(chunks);
    console.log(`✅ Audio received (${audioBuffer.length} bytes)`);
    
    // Convert to Int16Array
    const pcmData = new Int16Array(
      audioBuffer.buffer,
      audioBuffer.byteOffset,
      audioBuffer.length / 2
    );

    // Stream audio frames to persistent track
    const chunkSize = 1600; // 100ms at 16kHz
    for (let i = 0; i < pcmData.length; i += chunkSize) {
      const chunk = pcmData.slice(i, Math.min(i + chunkSize, pcmData.length));
      const audioFrame = new AudioFrame(
        chunk,
        16000,
        1,
        chunk.length
      );
      await persistentAudioSource.captureFrame(audioFrame);
      await sleep(100);
    }

    console.log('✅ Audio playback complete');
    
  } catch (error) {
    console.error('❌ Failed to speak:', error);
  }
}

// Helper function for timing audio frames
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the agent
main().catch((error) => {
  console.error('Agent error:', error);
  process.exit(1);
});
