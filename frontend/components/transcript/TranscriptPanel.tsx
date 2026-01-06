"use client";

import { useEffect, useRef } from "react";

interface TranscriptMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

interface TranscriptPanelProps {
  messages: TranscriptMessage[];
}

export default function TranscriptPanel({ messages }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm mt-8">
            AI is analyzing...
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-1">
              <div
                className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  message.role === "assistant"
                    ? "bg-slate-700/50 text-slate-200 mr-auto"
                    : "bg-indigo-600/50 text-slate-100 ml-auto"
                }`}
              >
                <div className="text-xs text-slate-400 mb-1">
                  {message.role === "assistant" ? "AI Interviewer" : "You"}
                </div>
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
