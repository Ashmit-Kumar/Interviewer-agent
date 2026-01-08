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
import { connectDatabase } from '../../config/database';
import { connectRedis } from '../../config/redis';
import { interviewerAgent, Turn } from '../ai/interviewerAgent';
import { sessionRepository } from '../../repositories/sessionRepository';
import { livekitConfig } from '../../config/services';

// Speaker state machine (single source of truth for who can speak)
enum SpeakerState {
  IDLE = 'IDLE',
  SPEAKING = 'SPEAKING',
  CANCELED = 'CANCELED',
}

// Speaker ownership lock (prevents re-entrancy corruption)
let speakerState: SpeakerState = SpeakerState.IDLE;
let currentAbortController: AbortController | null = null;

async function main() {
  const [roomName, token, sessionId] = process.argv.slice(2);

  if (!roomName || !token || !sessionId) {
    console.error('Usage: node agent.js <roomName> <token> <sessionId>');
    process.exit(1);
  }

  // Connect to MongoDB before using sessionRepository
  try {
    await connectDatabase();
    console.log('✓ Agent connected to MongoDB');
  } catch (error) {
    console.error('❌ Agent failed to connect to MongoDB:', error);
    process.exit(1);
  }

  // Connect to Redis before using interviewOrchestrator
  try {
    await connectRedis();
    console.log('✓ Agent connected to Redis');
  } catch (error) {
    console.error('❌ Agent failed to connect to Redis:', error);
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
  console.log('🌐 [ROOM] Connecting to LiveKit...');
  console.log(`   - WebSocket URL: ${livekitConfig.wsUrl}`);
  console.log(`   - Room name: ${roomName}`);
  await room.connect(livekitConfig.wsUrl, token);

  console.log('✓ [ROOM] AI agent connected to room successfully');

  // Send initial greeting
  console.log('👋 [INIT] Sending initial greeting to candidate...');
  await speakToCandidate(room, "Hello! I'm your AI interviewer today. Are you ready to begin?");
  console.log('✓ [INIT] Initial greeting complete\n');
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
    
    // Only process final transcripts (ignore interim noise)
    if (!data.is_final) return;
    if (!transcript || !transcript.trim()) return;
    
    const timestamp = new Date().toISOString();
    console.log(`\n💬 [TRANSCRIPT] Final transcript received at ${timestamp}`);
    console.log(`   - Text: "${transcript}"`);
    console.log(`   - Length: ${transcript.length} characters`);
    console.log(`   - Current speaker state: ${speakerState}`);
    
    // If agent is speaking, interrupt immediately (candidate priority)
    if (speakerState === SpeakerState.SPEAKING) {
      console.log('⚡ [TRANSCRIPT] Candidate speaking while agent is active - interrupting');
      cancelSpeech();
    }

    try {
      console.log('💾 [TRANSCRIPT] Saving user transcript to database...');
      // Save transcript
      try {
        await sessionRepository.addTranscript(sessionId, {
          role: 'user',
          content: transcript,
          timestamp: new Date(),
        });
        console.log('✅ [TRANSCRIPT] User transcript saved successfully');
      } catch (dbError: unknown) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error('❌ [TRANSCRIPT] Failed to save user transcript:');
        console.error(`   - Session ID: ${sessionId}`);
        console.error(`   - Transcript: ${transcript.substring(0, 50)}...`);
        console.error(`   - Error: ${errorMsg}`);
        throw dbError;
      }

      console.log('🤖 [AI] Processing user message with AI agent...');
      const aiStartTime = Date.now();
      // Process with AI - returns array of turns
      const turns = await interviewerAgent.processUserMessage(sessionId, transcript);
      const aiProcessTime = Date.now() - aiStartTime;
      
      console.log(`✅ [AI] AI processing complete (${aiProcessTime}ms)`);
      console.log(`   - Generated turns: ${turns.length}`);
      turns.forEach((turn, idx) => {
        console.log(`   - Turn ${idx + 1}: ${turn.text.length} chars, pause ${turn.pauseAfterMs}ms`);
      });

      // Save full AI response as concatenated text
      const fullResponse = turns.map(t => t.text).join(' ');
      console.log(`💾 [TRANSCRIPT] Saving AI response to database (${fullResponse.length} chars)...`);
      
      try {
        await sessionRepository.addTranscript(sessionId, {
          role: 'assistant',
          content: fullResponse,
          timestamp: new Date(),
        });
        console.log('✅ [TRANSCRIPT] AI transcript saved successfully');
      } catch (dbError: unknown) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        console.error('❌ [TRANSCRIPT] Failed to save AI transcript:');
        console.error(`   - Session ID: ${sessionId}`);
        console.error(`   - Response length: ${fullResponse.length} chars`);
        console.error(`   - Error: ${errorMsg}`);
        throw dbError;
      }

      // Speak response turns one at a time with pauses
      console.log('🎤 [TRANSCRIPT] Initiating speech for AI response...');
      await speakTurnsToCandidate(sessionId, room, turns);
    } catch (processError) {
      console.error('❌ [TRANSCRIPT] Error processing transcript:');
      console.error('   - Error:', processError);
      console.error('   - Stack:', processError instanceof Error ? processError.stack : 'N/A');
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

async function speakTurnsToCandidate(
  _sessionId: string,
  room: Room,
  turns: Turn[]
) {
  console.log('🎭 [TURNS] Starting multi-turn speech sequence');
  console.log(`   - Total turns: ${turns.length}`);
  
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    
    console.log(`\n🔢 [TURNS] Processing turn ${i + 1}/${turns.length}`);
    console.log(`   - Text length: ${turn.text.length} characters`);
    console.log(`   - Pause after: ${turn.pauseAfterMs}ms`);
    
    // Check if canceled between turns
    if (speakerState === SpeakerState.CANCELED) {
      console.log('🛑 [TURNS] Speech canceled - stopping remaining turns');
      speakerState = SpeakerState.IDLE;
      return;
    }

    console.log(`📢 [TURNS] Turn ${i + 1} text: "${turn.text.substring(0, 100)}..."`);
    await speakToCandidate(room, turn.text);
    
    // Natural pause between turns
    if (i < turns.length - 1) {
      console.log(`⏸️  [TURNS] Inter-turn pause: ${turn.pauseAfterMs}ms`);
      await sleep(turn.pauseAfterMs);
    }
  }
  
  console.log('✅ [TURNS] All turns completed successfully\n');
}

/**
 * Speak to candidate with atomic speaker lock.
 * 
 * Key design:
 * - Fresh AudioSource + AudioTrack per turn (no persistent state)
 * - AbortController for mid-word cancellation
 * - Guaranteed cleanup (track unpublished even on error)
 * - Re-entrancy safe (cancels previous speech if called during active speech)
 */
async function speakToCandidate(room: Room, text: string) {
  const startTime = Date.now();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎤 [VOICE] Starting speech generation');
  console.log(`📝 [VOICE] Text length: ${text.length} characters`);
  console.log(`📝 [VOICE] Text preview: "${text.substring(0, 100)}..."`);
  console.log(`🔒 [VOICE] Current speaker state: ${speakerState}`);

  // Cancel any currently active speech (re-entrancy protection)
  if (speakerState === SpeakerState.SPEAKING) {
    console.log('⚠️  [VOICE] Detected concurrent speech - canceling previous');
    cancelSpeech();
  }

  speakerState = SpeakerState.SPEAKING;
  const abortController = new AbortController();
  currentAbortController = abortController;
  console.log('✅ [VOICE] Speaker lock acquired - state set to SPEAKING');

  let audioSource: AudioSource | null = null;
  let audioTrack: LocalAudioTrack | null = null;

  try {
    if (!room.localParticipant) {
      throw new Error('Local participant not available');
    }
    console.log('✅ [VOICE] Room participant verified');

    // Small human pause before speaking
    console.log('⏱️  [VOICE] Pre-speech pause: 300ms');
    await sleep(300);
    if (abortController.signal.aborted) {
      console.log('🛑 [VOICE] Aborted during pre-speech pause');
      return;
    }

    console.log('🎵 [VOICE] Initializing ElevenLabs client');
    const elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY!,
    });

    // Generate TTS stream
    const ttsStartTime = Date.now();
    console.log(`🌐 [VOICE] Requesting TTS from ElevenLabs...`);
    console.log(`   - Voice ID: ${process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb'}`);
    console.log(`   - Model: eleven_turbo_v2_5`);
    console.log(`   - Format: pcm_48000 (48kHz, 16-bit, mono PCM)`);
    
    const ttsStream = await elevenlabs.textToSpeech.convertAsStream(
      process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb',
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'pcm_48000',
      }
    );
    
    const ttsConnectTime = Date.now() - ttsStartTime;
    console.log(`✅ [VOICE] TTS stream ready (${ttsConnectTime}ms connection time)`);

    if (abortController.signal.aborted) {
      console.log('🛑 [VOICE] Aborted after TTS connection');
      return;
    }

    // Create FRESH audio track for this turn (no shared state)
    console.log('🎙️  [VOICE] Creating fresh AudioSource + AudioTrack');
    audioSource = new AudioSource(48000, 1);
    console.log('   - Sample rate: 48000 Hz');
    console.log('   - Channels: 1 (mono)');
    
    audioTrack = LocalAudioTrack.createAudioTrack('agent-voice', audioSource);
    console.log(`   - Track created with name: "agent-voice"`);
    
    const opts = {};
    const publishStartTime = Date.now();
    await room.localParticipant.publishTrack(
      audioTrack,
      opts as Parameters<typeof room.localParticipant.publishTrack>[1]
    );
    const publishTime = Date.now() - publishStartTime;
    console.log(`✅ [VOICE] Track published to LiveKit (${publishTime}ms)`);
    console.log(`   - Track SID: ${audioTrack.sid}`);

    // Stream PCM frames with real-time pacing
    console.log('🎧 [VOICE] Starting frame-by-frame audio playback...');
    let chunkCount = 0;
    let totalBytes = 0;
    let totalSamples = 0;
    const playbackStartTime = Date.now();

    for await (const chunk of ttsStream) {
      chunkCount++;
      const chunkReceiveTime = Date.now();
      
      // Check cancellation
      if (abortController.signal.aborted) {
        console.log(`🛑 [VOICE] Speech canceled mid-stream at chunk ${chunkCount}`);
        break;
      }

      totalBytes += chunk.length;
      const chunkSamples = chunk.length / 2; // 16-bit = 2 bytes per sample
      const chunkDurationMs = (chunkSamples / 48000) * 1000; // REAL duration of this chunk
      totalSamples += chunkSamples;
      const cumulativeAudioDurationMs = (totalSamples / 48000) * 1000;
      
      console.log(`📦 [VOICE] TTS Chunk ${chunkCount}:`);
      console.log(`   - Size: ${chunk.length} bytes (${chunkSamples} samples)`);
      console.log(`   - Chunk duration: ${chunkDurationMs.toFixed(1)}ms (THIS chunk's real audio)`);
      console.log(`   - Cumulative: ${totalBytes} bytes total`);
      console.log(`   - Cumulative audio duration: ${cumulativeAudioDurationMs.toFixed(1)}ms`);
      console.log(`   - Elapsed time: ${Date.now() - playbackStartTime}ms`);

      const pcm = new Int16Array(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength / 2
      );

      console.log(`🎵 [VOICE] Creating AudioFrame with ${pcm.length} samples`);
      const frame = new AudioFrame(pcm, 48000, 1, pcm.length);
      
      const captureStartTime = Date.now();
      audioSource.captureFrame(frame);
      const captureTime = Date.now() - captureStartTime;
      console.log(`✅ [VOICE] Frame captured to LiveKit (${captureTime}ms)`);

      // ⚡ CRITICAL FIX: Real-time pacing based on ACTUAL audio duration (not arbitrary 18ms)
      // This ensures 500ms of audio takes ~500ms to send, not 100ms
      console.log(`⏱️  [VOICE] Real-time pacing delay: ${chunkDurationMs.toFixed(1)}ms (based on sample count)`);
      await sleep(chunkDurationMs);
      
      const chunkProcessTime = Date.now() - chunkReceiveTime;
      console.log(`⏲️  [VOICE] Chunk ${chunkCount} total processing: ${chunkProcessTime}ms`);
    }

    const totalPlaybackTime = Date.now() - playbackStartTime;
    const expectedAudioDuration = (totalSamples / 48000) * 1000;
    const timeDifference = totalPlaybackTime - expectedAudioDuration;
    const pacingAccuracy = ((expectedAudioDuration / totalPlaybackTime) * 100).toFixed(1);
    
    console.log('✅ [VOICE] Speech stream completed');
    console.log(`📊 [VOICE] Playback Statistics:`);
    console.log(`   - Total chunks: ${chunkCount}`);
    console.log(`   - Total bytes: ${totalBytes}`);
    console.log(`   - Total samples: ${totalSamples}`);
    console.log(`   - Expected audio duration: ${expectedAudioDuration.toFixed(0)}ms`);
    console.log(`   - Actual playback time: ${totalPlaybackTime}ms`);
    console.log(`   - Time difference: ${timeDifference.toFixed(0)}ms`);
    console.log(`   - Pacing accuracy: ${pacingAccuracy}% (should be ~100%)`);
    
    if (Math.abs(timeDifference) > 100) {
      console.log(`   ⚠️  WARNING: Pacing off by ${Math.abs(timeDifference).toFixed(0)}ms - audio may sound rushed!`);
    } else {
      console.log(`   ✅ Real-time pacing verified! Audio should sound natural.`);
    }

    // Natural trailing pause
    console.log('⏱️  [VOICE] Post-speech pause: 200ms');
    await sleep(200);

    // Natural trailing pause
    console.log('⏱️  [VOICE] Post-speech pause: 200ms');
    await sleep(200);

  } catch (err) {
    if (!abortController.signal.aborted) {
      console.error('❌ [VOICE] Error during speech playback:');
      console.error('   - Error type:', err instanceof Error ? err.constructor.name : typeof err);
      console.error('   - Error message:', err instanceof Error ? err.message : String(err));
      console.error('   - Stack trace:', err instanceof Error ? err.stack : 'N/A');
    } else {
      console.log('ℹ️  [VOICE] Error ignored due to cancellation');
    }
  } finally {
    const cleanupStartTime = Date.now();
    console.log('🧹 [VOICE] Starting cleanup...');
    
    // ALWAYS cleanup track (prevent zombie audio sources)
    if (audioTrack && room.localParticipant && audioTrack.sid) {
      try {
        console.log(`🗑️  [VOICE] Unpublishing track: ${audioTrack.sid}`);
        await room.localParticipant.unpublishTrack(audioTrack.sid);
        const unpublishTime = Date.now() - cleanupStartTime;
        console.log(`✅ [VOICE] Track unpublished successfully (${unpublishTime}ms)`);
      } catch (e) {
        console.log('⚠️  [VOICE] Track unpublish failed (may already be gone):', e instanceof Error ? e.message : String(e));
      }
    } else {
      console.log('ℹ️  [VOICE] No track to unpublish');
    }

    // Reset speaker state if this is still the active controller
    if (currentAbortController === abortController) {
      currentAbortController = null;
      speakerState = SpeakerState.IDLE;
      console.log('🔓 [VOICE] Speaker lock released - state set to IDLE');
    } else {
      console.log('⚠️  [VOICE] Abort controller mismatch - state not reset');
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`⏲️  [VOICE] Total function time: ${totalTime}ms`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
}

/**
 * Cancel currently active speech (mid-word).
 * Sets state to CANCELED and aborts TTS stream.
 */
function cancelSpeech() {
  console.log('🔇 [CANCEL] Cancel speech requested');
  console.log(`   - Current state: ${speakerState}`);
  console.log(`   - Has abort controller: ${!!currentAbortController}`);
  
  if (currentAbortController && speakerState === SpeakerState.SPEAKING) {
    console.log('✅ [CANCEL] Aborting active speech');
    speakerState = SpeakerState.CANCELED;
    currentAbortController.abort();
    currentAbortController = null;
    console.log('✅ [CANCEL] Speech successfully canceled');
  } else {
    console.log('⚠️  [CANCEL] No active speech to cancel');
  }
}

// Helper function for timing
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the agent
main().catch((error) => {
  console.error('Agent error:', error);
  process.exit(1);
});
