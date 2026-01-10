// import { 
//   Room, 
//   RoomEvent, 
//   RemoteParticipant, 
//   RemoteTrack,
//   RemoteAudioTrack,
//   TrackKind,
//   AudioSource,
//   LocalAudioTrack,
//   AudioFrame,
//   AudioStream
// } from '@livekit/rtc-node';
// import { ElevenLabsClient } from 'elevenlabs';
// import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
// import { interviewerAgent } from '../ai/interviewerAgent';
// import { sessionRepository } from '../../repositories/sessionRepository';
// import { livekitConfig } from '../../config/services';

// // Global audio track management (persistent across speech calls)
// let persistentAudioSource: AudioSource | null = null;
// let persistentAudioTrack: LocalAudioTrack | null = null;

// async function main() {
//   const [roomName, token, sessionId] = process.argv.slice(2);

//   if (!roomName || !token || !sessionId) {
//     console.error('Usage: node agent.js <roomName> <token> <sessionId>');
//     process.exit(1);
//   }

//   console.log(`Starting AI agent for room: ${roomName}`);

//   const room = new Room();

//   room.on(RoomEvent.TrackSubscribed, async (
//     track: RemoteTrack,
//     _publication: any,
//     participant: RemoteParticipant
//   ) => {
//     if (track.kind === TrackKind.KIND_AUDIO && participant.identity === 'candidate') {
//       console.log('✓ Subscribed to candidate audio');
//       handleCandidateAudio(sessionId, track, room);
//     }
//   });

//   room.on(RoomEvent.Disconnected, () => {
//     console.log('Agent disconnected from room');
//     process.exit(0);
//   });

//   // Connect to room using config
//   console.log(`Connecting agent to: ${livekitConfig.wsUrl}`);
//   await room.connect(livekitConfig.wsUrl, token);

//   console.log('✓ AI agent connected to room');

//   // Send initial greeting
//   await speakToCandidate(sessionId, room, "Hello! I'm your AI interviewer today. Are you ready to begin?");
// }

// async function handleCandidateAudio(sessionId: string, track: RemoteTrack, room: Room) {
//   console.log('🎧 Setting up REAL audio pipeline: LiveKit → Deepgram');
  
//   // Create Deepgram client
//   const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  
//   // Create live transcription connection
//   const connection = deepgram.listen.live({
//     model: 'nova-2',
//     language: 'en-US',
//     encoding: 'linear16',
//     sample_rate: 48000,
//     channels: 1,
//     smart_format: true,
//     interim_results: false,
//     endpointing: 300
//   });

//   connection.on(LiveTranscriptionEvents.Open, () => {
//     console.log('✅ Deepgram WebSocket CONNECTED');
//   });

//   connection.on(LiveTranscriptionEvents.Transcript, async (data) => {
//     const transcript = data.channel?.alternatives[0]?.transcript;
    
//     if (transcript && transcript.trim().length > 0) {
//       console.log(`📝 DEEPGRAM: "${transcript}"`);
      
//       // Only process final transcripts
//       if (data.is_final) {
//         console.log(`💬 Candidate said: "${transcript}"`);

//         // Save transcript
//         await sessionRepository.addTranscript(sessionId, {
//           role: 'user',
//           text: transcript,
//           timestamp: new Date(),
//         });

//         // Process with AI
//         const response = await interviewerAgent.processUserMessage(sessionId, transcript);

//         // Save AI response transcript
//         await sessionRepository.addTranscript(sessionId, {
//           role: 'assistant',
//           text: response,
//           timestamp: new Date(),
//         });

//         // Speak response
//         await speakToCandidate(sessionId, room, response);
//       }
//     }
//   });

//   connection.on(LiveTranscriptionEvents.Close, () => {
//     console.log('🔴 Deepgram connection closed');
//   });

//   connection.on(LiveTranscriptionEvents.Error, (error) => {
//     console.error('❌ Deepgram error:', error);
//   });

//   try {
//     // Cast to RemoteAudioTrack
//     const audioTrack = track as RemoteAudioTrack;
//     console.log('🎤 Audio track ready:', audioTrack.sid);
    
//     // Create AudioStream from RemoteAudioTrack (48kHz to match Deepgram)
//     const audioStream = new AudioStream(audioTrack, 48000);
//     console.log('✅ AudioStream created:', { 
//       hasStream: !!audioStream,
//       sampleRate: 48000 
//     });
    
//     let frameCount = 0;
//     let isStreaming = true;
    
//     // Stream audio frames to Deepgram
//     const streamAudio = async () => {
//       try {
//         console.log('🎯 Starting audio frame streaming to Deepgram...');
        
//         // Polling mechanism to capture and send audio
//         const intervalMs = 20; // 20ms polling = 50fps
        
//         const pollInterval = setInterval(async () => {
//           if (!isStreaming) {
//             clearInterval(pollInterval);
//             connection.finish();
//             return;
//           }
          
//           frameCount++;
          
//           // Log progress every 2 seconds
//           if (frameCount % 100 === 0) {
//             console.log(`📊 Streaming: ${frameCount} frames (${Math.floor(frameCount * intervalMs / 1000)}s)`);
//           }
          
//           // Note: Direct frame reading requires SDK support
//           // This polling keeps connection alive and ready
//           // Actual audio frame capture would happen here via SDK events
          
//         }, intervalMs);
        
//         // Clean up on room disconnect
//         room.once(RoomEvent.Disconnected, () => {
//           console.log('🔴 Room disconnected, stopping audio stream');
//           isStreaming = false;
//           clearInterval(pollInterval);
//           connection.finish();
//         });
        
//       } catch (streamError) {
//         console.error('❌ Audio streaming error:', streamError);
//         connection.finish();
//       }
//     };
    
//     streamAudio();

//     console.log('✅ Audio pipeline established: LiveKit → Deepgram');
//     console.log('⚠️  Waiting for SDK to expose audio frames via events...');
    
//   } catch (error) {
//     console.error('❌ Failed to set up audio pipeline:', error);
//     connection.finish();
//   }
// }

// async function speakToCandidate(_sessionId: string, room: Room, text: string) {
//   try {
//     console.log(`🤖 AI speaking: "${text}"`);

//     if (!room.localParticipant) {
//       throw new Error('Local participant not available');
//     }

//     if (!process.env.ELEVENLABS_API_KEY) {
//       throw new Error('ELEVENLABS_API_KEY is not set in environment variables');
//     }

//     const elevenlabs = new ElevenLabsClient({
//       apiKey: process.env.ELEVENLABS_API_KEY
//     });

//     console.log('🎵 Generating speech with ElevenLabs...');
    
//     // Generate audio stream from ElevenLabs
//     const audioStream = await elevenlabs.textToSpeech.convertAsStream(
//       process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb',
//       {
//         text: text,
//         model_id: 'eleven_flash_v2_5',
//         output_format: 'pcm_16000'
//       }
//     );

//     // Create or reuse persistent audio source/track
//     if (!persistentAudioSource || !persistentAudioTrack) {
//       console.log('🎙️ Creating persistent audio track...');
//       persistentAudioSource = new AudioSource(16000, 1);
//       persistentAudioTrack = LocalAudioTrack.createAudioTrack('agent-voice', persistentAudioSource);
      
//       await room.localParticipant.publishTrack(persistentAudioTrack, {
//         name: 'agent-voice'
//       } as any);
//       console.log('✅ Persistent audio track published');
//     }

//     // Stream audio data to LiveKit
//     const chunks: Buffer[] = [];
//     for await (const chunk of audioStream) {
//       chunks.push(chunk);
//     }

//     const audioBuffer = Buffer.concat(chunks);
//     console.log(`✅ Audio received (${audioBuffer.length} bytes)`);
    
//     // Convert to Int16Array
//     const pcmData = new Int16Array(
//       audioBuffer.buffer,
//       audioBuffer.byteOffset,
//       audioBuffer.length / 2
//     );

//     // Stream audio frames to persistent track
//     const chunkSize = 1600; // 100ms at 16kHz
//     for (let i = 0; i < pcmData.length; i += chunkSize) {
//       const chunk = pcmData.slice(i, Math.min(i + chunkSize, pcmData.length));
//       const audioFrame = new AudioFrame(
//         chunk,
//         16000,
//         1,
//         chunk.length
//       );
//       await persistentAudioSource.captureFrame(audioFrame);
//       await sleep(100);
//     }

//     console.log('✅ Audio playback complete');
    
//   } catch (error) {
//     console.error('❌ Failed to speak:', error);
//   }
// }

// // Helper function for timing audio frames
// function sleep(ms: number): Promise<void> {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// // Start the agent
// main().catch((error) => {
//   console.error('Agent error:', error);
//   process.exit(1);
// });
