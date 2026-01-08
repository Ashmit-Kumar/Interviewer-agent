import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
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
  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const agentAudioRef = useRef<HTMLAudioElement | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onTrackSubscribedRef = useRef(onTrackSubscribed);

  // Update callback refs when they change
  useEffect(() => {
    onConnectedRef.current = onConnected;
    onDisconnectedRef.current = onDisconnected;
    onTrackSubscribedRef.current = onTrackSubscribed;
  }, [onConnected, onDisconnected, onTrackSubscribed]);

  // Create a single persistent audio element on mount (reused for all agent audio)
  useEffect(() => {
    if (!agentAudioRef.current) {
      console.log('🔊 [AUDIO] Creating persistent <audio> element for agent');
      const el = document.createElement('audio');
      el.autoplay = true;
      el.volume = 1.0;
      el.muted = false;
      el.style.display = 'none';
      document.body.appendChild(el);
      agentAudioRef.current = el;
      console.log('✅ [AUDIO] Persistent element ready', {
        autoplay: el.autoplay,
        volume: el.volume,
        muted: el.muted,
      });
    }

    return () => {
      if (agentAudioRef.current) {
        console.log('🧹 [AUDIO] Removing persistent <audio> element');
        agentAudioRef.current.remove();
        agentAudioRef.current = null;
      }
    };
  }, []);

  // FIX ONE: Ready gate - ensure config is fully loaded
  const isConfigReady = Boolean(token) && Boolean(wsUrl) && Boolean(roomName);

  useEffect(() => {
    // Check if config is ready
    if (!isConfigReady) {
      console.log('⏳ LiveKit config not ready yet', {
        hasToken: !!token,
        hasWsUrl: !!wsUrl,
        hasRoomName: !!roomName,
      });
      return;
    }

    // FIX THREE: Guard against double connect
    if (connectingRef.current) {
      console.log('⚠️ Already connecting, skipping');
      return;
    }

    // CRITICAL VALIDATION - Must happen before ANY connection attempt
    console.log('🔍 LiveKit Connection Validation:', {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      wsUrl,
      wsUrlType: typeof wsUrl,
      roomName,
    });

    // Validate token
    if (!token || token.length === 0) {
      console.error('❌ FATAL: LiveKit token is missing or empty');
      console.error('Backend must provide a valid JWT token');
      return;
    }

    // Validate wsUrl
    if (typeof wsUrl !== 'string') {
      console.error('❌ FATAL: wsUrl is not a string:', typeof wsUrl);
      return;
    }

    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      console.error('❌ FATAL: wsUrl must start with ws:// or wss://', wsUrl);
      return;
    }

    // Validate room name
    if (!roomName || roomName.length === 0) {
      console.error('❌ FATAL: Room name is missing');
      return;
    }

    console.log('✅ All validations passed. Connecting to LiveKit...');

    // FIX TWO: Persist Room instance using useRef - create once
    if (!roomRef.current) {
      roomRef.current = new Room();
    }
    const room = roomRef.current;

    // Event: Room connected
    room.on(RoomEvent.Connected, () => {
      console.log('✅ Connected to LiveKit room:', roomName);
      setIsConnected(true);
      onConnectedRef.current?.();
    });

    // Event: Room disconnected
    room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from LiveKit room');
      setIsConnected(false);
      onDisconnectedRef.current?.();
    });

    // Event: Track subscribed (AI audio)
    room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, publication: RemoteTrackPublication) => {
        if (track.kind === Track.Kind.Audio && publication.trackName === 'agent-voice') {
          console.log('🎵 NEW AGENT TRACK (subscribed):', {
            trackSid: track.sid,
            trackName: publication.trackName,
          });
          setIsAISpeaking(true);
          onTrackSubscribedRef.current?.(track);
          
          // Attach track to persistent audio element (created on mount)
          if (agentAudioRef.current) {
            track.attach(agentAudioRef.current);
          }
          
          // Ensure playback starts (handle autoplay blocking)
          agentAudioRef.current!.play().then(() => {
            console.log('✅ Audio playback started successfully');
          }).catch((err) => {
            console.error('❌ Audio playback blocked by browser:', err);
            console.error('User must interact with page to enable audio');
          });
        } else if (track.kind === Track.Kind.Audio) {
          console.log('ℹ️ Ignoring non-agent audio track:', {
            trackSid: track.sid,
            trackName: publication.trackName,
          });
        }
      }
    );

    // Event: Track unpublished (agent stopped speaking)
    // NOTE: We do NOT detach audio here - let browser finish playing buffered audio
    room.on(RoomEvent.TrackUnpublished, (publication: RemoteTrackPublication) => {
      if (publication.kind === Track.Kind.Audio && publication.trackName === 'agent-voice') {
        console.log('✅ Agent finished (unpublished):', {
          trackSid: publication.trackSid,
          trackName: publication.trackName,
        });
        setIsAISpeaking(false);
        // ✅ NO track.detach() here - let audio play naturally to completion
        console.log('🎧 Audio element kept alive - playback will finish naturally');
      }
    });

    // Connect to the room with validated parameters
    console.log('🚀 Initiating connection with:', { wsUrl, tokenPreview: token.substring(0, 20) + '...' });
    
    // Set connection lock
    connectingRef.current = true;
    
    room
      .connect(wsUrl, token)
      .then(async () => {
        console.log('✅ LiveKit connection established successfully');
        
        // Enable and publish microphone
        try {
          console.log('🎤 Enabling microphone...');
          await room.localParticipant.setMicrophoneEnabled(true);
          console.log('✅ Microphone enabled and published');
          
          // Verify track is published
          const micTrack = room.localParticipant.audioTrackPublications.values().next().value;
          if (micTrack) {
            console.log('✅ Microphone track confirmed:', {
              trackSid: micTrack.trackSid,
              isMuted: micTrack.isMuted,
            });
          }
        } catch (micError) {
          console.error('❌ Failed to enable microphone:', micError);
          // Don't disconnect - user can manually enable later
        }
        
        connectingRef.current = false;
      })
      .catch((error) => {
        console.error('❌ Failed to connect to LiveKit room:', error);
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          wsUrl,
          roomName,
        });
        connectingRef.current = false;
      });

    // FIX FOUR: Cleanup ONLY if actually connected
    return () => {
      if (roomRef.current?.state === 'connected') {
        console.log('🔌 Cleaning up LiveKit connection');
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      connectingRef.current = false;
    };
  }, [isConfigReady, roomName, token, wsUrl]);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;

    const localParticipant = roomRef.current.localParticipant;
    const newMutedState = !isMuted;
    
    await localParticipant.setMicrophoneEnabled(!newMutedState);
    setIsMuted(newMutedState);
  }, [isMuted]);

  const disconnect = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect();
    }
  }, []);

  return {
    isConnected,
    isMuted,
    isAISpeaking,
    toggleMute,
    disconnect,
    room: roomRef.current,
  };
}
