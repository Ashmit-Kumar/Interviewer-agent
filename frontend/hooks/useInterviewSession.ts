"use client";

import { useState, useCallback } from "react";

interface InterviewSession {
  sessionId: string;
  questionTitle: string;
  status: "active" | "ended";
  code: string;
  startedAt: Date;
}

export function useInterviewSession() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/session/start', { method: 'POST' });
      // const data = await response.json();
      
      // Mock session for now
      const newSession: InterviewSession = {
        sessionId: `session_${Date.now()}`,
        questionTitle: "Two Sum Problem",
        status: "active",
        code: "",
        startedAt: new Date(),
      };
      
      setSession(newSession);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCode = useCallback((code: string) => {
    if (session) {
      setSession({ ...session, code });
      
      // TODO: Implement autosave to backend
      // debounce(() => {
      //   fetch(`/api/session/${session.sessionId}/code`, {
      //     method: 'PUT',
      //     body: JSON.stringify({ code }),
      //   });
      // }, 2000);
    }
  }, [session]);

  const endSession = useCallback(async () => {
    if (!session) return;
    
    setIsLoading(true);
    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/session/${session.sessionId}/end`, { method: 'POST' });
      
      setSession({ ...session, status: "ended" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  return {
    session,
    isLoading,
    error,
    startSession,
    updateCode,
    endSession,
  };
}
