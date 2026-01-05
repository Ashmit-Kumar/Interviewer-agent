"use client";

import { useState, useCallback, useEffect } from "react";
import Vapi from "@vapi-ai/web";

interface UseVapiOptions {
  publicKey: string;
  assistantId: string;
  onTranscript?: (transcript: string, role: "assistant" | "user") => void;
  onCallEnd?: () => void;
}

export function useVapi({
  publicKey,
  assistantId,
  onTranscript,
  onCallEnd,
}: UseVapiOptions) {
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [agentState, setAgentState] = useState<"idle" | "listening" | "speaking">("idle");

  useEffect(() => {
    // Initialize Vapi client
    const vapiClient = new Vapi(publicKey);
    setVapi(vapiClient);

    // Set up event listeners
    vapiClient.on("call-start", () => {
      console.log("Call started");
      setIsCallActive(true);
      setAgentState("listening");
    });

    vapiClient.on("call-end", () => {
      console.log("Call ended");
      setIsCallActive(false);
      setAgentState("idle");
      onCallEnd?.();
    });

    vapiClient.on("speech-start", () => {
      console.log("Agent speaking");
      setAgentState("speaking");
    });

    vapiClient.on("speech-end", () => {
      console.log("Agent listening");
      setAgentState("listening");
    });

    vapiClient.on("message", (message: any) => {
      console.log("Message received:", message);
      
      // Handle transcript messages
      if (message.type === "transcript") {
        const role = message.role === "assistant" ? "assistant" : "user";
        onTranscript?.(message.transcript, role);
      }
    });

    vapiClient.on("error", (error: Error) => {
      console.error("Vapi error:", error);
    });

    return () => {
      // Cleanup
      if (vapiClient) {
        vapiClient.stop();
      }
    };
  }, [publicKey, onTranscript, onCallEnd]);

  const startCall = useCallback(async (metadata?: Record<string, any>) => {
    if (!vapi) {
      throw new Error("Vapi client not initialized");
    }

    try {
      await vapi.start(assistantId, {
        metadata,
      });
    } catch (error) {
      console.error("Failed to start call:", error);
      throw error;
    }
  }, [vapi, assistantId]);

  const stopCall = useCallback(() => {
    if (vapi) {
      vapi.stop();
    }
  }, [vapi]);

  const toggleMute = useCallback(() => {
    if (vapi && isCallActive) {
      if (isMuted) {
        vapi.setMuted(false);
        setIsMuted(false);
      } else {
        vapi.setMuted(true);
        setIsMuted(true);
      }
    }
  }, [vapi, isCallActive, isMuted]);

  return {
    isCallActive,
    isMuted,
    agentState,
    startCall,
    stopCall,
    toggleMute,
  };
}
