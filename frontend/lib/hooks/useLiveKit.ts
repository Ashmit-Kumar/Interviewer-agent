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
}

export function useLiveKit({
  roomName,
  token,
  wsUrl,
  onConnected,
  onDisconnected,
  onTrackSubscribed,
}: UseLiveKitOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
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
    audioContextRestricted,
    startAudio,
    toggleMute,
    disconnect,
    room: roomRef.current,
  };
}
