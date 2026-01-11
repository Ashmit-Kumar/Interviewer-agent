import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  ConnectionState,
} from 'livekit-client';

interface UseLiveKitOptions {
  roomName: string;
  token: string;
  wsUrl: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onTrackSubscribed?: (track: RemoteTrack) => void;
  onTranscriptReceived?: (transcript: { role: string; content: string; timestamp: number }) => void;
}

export function useLiveKit({
  roomName,
  token,
  wsUrl,
  onConnected,
  onDisconnected,
  onTrackSubscribed,
  onTranscriptReceived,
}: UseLiveKitOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [audioContextRestricted, setAudioContextRestricted] = useState(false);
  
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const agentAudioRef = useRef<HTMLAudioElement | null>(null);

  // 1. Persistent Audio Element with enhanced logging
  useEffect(() => {
    if (!agentAudioRef.current) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.id = "livekit-agent-audio";
      document.body.appendChild(el);
      agentAudioRef.current = el;
      console.log('🔊 [AUDIO_SETUP] Global audio element created');
    }
    return () => {
      agentAudioRef.current?.remove();
      agentAudioRef.current = null;
    };
  }, []);

  const isConfigReady = Boolean(token) && Boolean(wsUrl) && Boolean(roomName);

  useEffect(() => {
    if (!isConfigReady || connectingRef.current) return;

    console.log('🚀 [CONNECTION_START] Validating params...', { roomName, wsUrl });

    if (!token) {
      alert("Voice Error: Authentication token is missing.");
      return;
    }

    if (!roomRef.current) {
      roomRef.current = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
    }
    
    const room = roomRef.current;

    // --- EVENT HANDLERS ---

    room.on(RoomEvent.Connected, () => {
      console.log('✅ [ROOM_CONNECTED] Successfully joined:', room.name);
      setIsConnected(true);
      onConnected?.();
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      console.warn('⚠️ [ROOM_DISCONNECTED] Reason:', reason);
      setIsConnected(false);
      onDisconnected?.();
    });

    // CRITICAL: Handle Autoplay/AudioContext restrictions
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      console.log('🔇 [AUDIO_STATUS] Can playback:', room.canPlaybackAudio);
      setAudioContextRestricted(!room.canPlaybackAudio);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication) => {
      console.log(`🎵 [TRACK_SUBSCRIBED] Kind: ${track.kind}, Name: ${publication.trackName}, SID: ${track.sid}`);
      
      if (track.kind === Track.Kind.Audio) {
        setIsAISpeaking(true);
        onTrackSubscribed?.(track);

        if (agentAudioRef.current) {
          track.attach(agentAudioRef.current);
          console.log('🔗 [AUDIO_ATTACH] Track attached to DOM element');

          agentAudioRef.current.play().catch((err) => {
            console.error('🚫 [AUTOPLAY_BLOCKED] Browser prevented audio:', err);
            setAudioContextRestricted(true);
          });
        }
      }
    });

    room.on(RoomEvent.TrackUnpublished, (pub) => {
      if (pub.kind === Track.Kind.Audio) {
        console.log('⏹️ [TRACK_STOPPED] AI finished speaking');
        setIsAISpeaking(false);
      }
    });

    room.on(RoomEvent.DataReceived, (payload, participant) => {
      // Raw logging to debug missing messages
      try {
      console.log('📥 [RAW_DATA_RECEIVED] From:', participant?.identity);
      const decoder = new TextDecoder();
      const decodedString = decoder.decode(payload);
      console.log('📄 [DECODED_DATA]:', decodedString);
      console.log('🔍 [DATA_INCOMING] Raw:', decodedString);

        const data = JSON.parse(decodedString);

        // Handle end-of-interview signal from agent
        if (data.type === 'interview_end') {
          console.log('🏁🏁🏁 [END_SIGNAL_RECEIVED] sessionId:', data.sessionId, data);
          console.warn('SYSTEM ALERT: INTERVIEW ENDING BY AGENT COMMAND');
          try {
            window.dispatchEvent(new CustomEvent('interview-ended', { detail: { sessionId: data.sessionId } }));
            console.log("✅ [EVENT_DISPATCHED] 'interview-ended' sent to window");
          } catch (e) {
            console.error('❌ [EVENT_DISPATCH_ERROR]', e);
          }
          // Hard redirect shortly after signal to ensure user lands on results
          try {
            if (typeof window !== 'undefined') {
              const targetUrl = `/results?sessionId=${data.sessionId || roomName}`;
              console.log('🚀 [REDIRECT] Navigating to:', targetUrl);
              // Give a tiny delay so the user can hear last audio
              setTimeout(() => {
                try {
                  if (window.location.pathname.includes('/interview')) {
                    window.location.href = targetUrl;
                  }
                } catch (e) {
                  console.error('❌ [HARD_REDIRECT_ERR]', e);
                }
              }, 2000);
            }
          } catch (e) {
            console.error('❌ [REDIRECT_SETUP_ERR]', e);
          }
          return;
        }

        if (data.type === 'transcript' && data.content) {
          console.log(`✨ [MATCHED_TRANSCRIPT] ${data.role}:`, data.content);
          onTranscriptReceived?.({
            role: data.role,
            content: data.content,
            timestamp: Date.now(),
          });
          return;
        }

        if (data.type === 'state' && data.state) {
          console.log('🧠 [STATE_UPDATE]:', data.state);
          setIsAIThinking(data.state === 'thinking');
          if (data.state === 'speaking') setIsAISpeaking(true);
          if (data.state === 'listening') setIsAISpeaking(false);
          return;
        }
      } catch (e) {
        console.error('❌ [DATA_PARSE_ERROR] Payload was not JSON or decode failed:', e);
      }
    });

    // --- EXECUTE CONNECTION ---
    connectingRef.current = true;
    room.connect(wsUrl, token)
      .then(async () => {
        console.log('🎤 [MIC_START] Requesting microphone access...');
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          console.log('✅ [MIC_SUCCESS] Microphone published');
        } catch (e: any) {
          console.error('❌ [MIC_ERROR]', e);
          alert(`Microphone Error: ${e.message}. Please allow mic access and refresh.`);
        }
      })
      .catch((err) => {
        connectingRef.current = false;
        console.error('❌ [CONNECTION_FAILED]', err);
        alert(`Failed to connect to voice server: ${err.message}`);
      });

    return () => {
      if (room.state !== ConnectionState.Disconnected) {
        console.log('🔌 [CLEANUP] Disconnecting room');
        room.disconnect();
      }
      connectingRef.current = false;
    };
  }, [token, wsUrl]); // Only reconnect if token or wsUrl actually changes

  // --- ACTIONS ---

  const startAudio = useCallback(async () => {
    if (!roomRef.current) return;
    console.log('🔊 [START_AUDIO] Attempting to resume AudioContext...');
    try {
      await roomRef.current.startAudio();
      setAudioContextRestricted(false);
      console.log('✅ [AUDIO_RESUMED] Context is now running');
    } catch (e) {
      console.error('❌ [AUDIO_RESUME_FAILED]', e);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;
    const local = roomRef.current.localParticipant;
    const nextMute = !isMuted;
    console.log(`🎙️ [MUTE_TOGGLE] Setting mute to: ${nextMute}`);
    await local.setMicrophoneEnabled(!nextMute);
    setIsMuted(nextMute);
  }, [isMuted]);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
  }, []);

  return {
    isConnected,
    isMuted,
    isAISpeaking,
    isAIThinking,
    audioContextRestricted,
    startAudio,
    toggleMute,
    disconnect,
    room: roomRef.current,
  };
}
