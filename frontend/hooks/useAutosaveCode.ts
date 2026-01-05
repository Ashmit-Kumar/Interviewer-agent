"use client";

import { useEffect, useRef } from "react";

interface UseAutosaveCodeOptions {
  code: string;
  sessionId: string;
  onSave: (code: string) => Promise<void>;
  debounceMs?: number;
}

export function useAutosaveCode({
  code,
  sessionId,
  onSave,
  debounceMs = 2000,
}: UseAutosaveCodeOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousCodeRef = useRef<string>(code);

  useEffect(() => {
    // Don't autosave if code hasn't changed
    if (code === previousCodeRef.current) {
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for autosave
    timeoutRef.current = setTimeout(async () => {
      try {
        await onSave(code);
        previousCodeRef.current = code;
        console.log("Code autosaved successfully");
      } catch (error) {
        console.error("Failed to autosave code:", error);
      }
    }, debounceMs);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [code, sessionId, onSave, debounceMs]);
}
