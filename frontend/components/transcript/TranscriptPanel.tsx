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
      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-700">Live Transcript</h2>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-slate-400 text-sm mt-8">
            Transcript will appear here...
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="space-y-2">
              <div className="text-xs text-slate-500">
                {message.role === "assistant" ? "AI Interviewer" : "You"}
              </div>
              <div
                className={`rounded-lg p-3 text-sm ${
                  message.role === "assistant"
                    ? "bg-blue-50 text-slate-800"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
