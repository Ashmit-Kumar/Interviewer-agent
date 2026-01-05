"use client";

import { useState, useCallback } from "react";

interface TranscriptMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

export function useTranscript() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);

  const addMessage = useCallback((content: string, role: "assistant" | "user") => {
    const newMessage: TranscriptMessage = {
      id: `msg_${Date.now()}_${Math.random()}`,
      role,
      content,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, newMessage]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addMessage,
    clearMessages,
  };
}
