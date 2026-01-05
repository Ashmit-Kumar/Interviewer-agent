"use client";

import { Mic, MicOff, Phone } from "lucide-react";

interface VoiceAgentPanelProps {
  isMuted: boolean;
  isCallActive: boolean;
  agentState: "idle" | "listening" | "speaking";
  onToggleMute: () => void;
  onEndCall: () => void;
}

export default function VoiceAgentPanel({
  isMuted,
  isCallActive,
  agentState,
  onToggleMute,
  onEndCall,
}: VoiceAgentPanelProps) {
  return (
    <div className="border-b border-slate-200 p-4">
      <h2 className="text-sm font-semibold text-slate-700 mb-4">
        Voice Controls
      </h2>
      
      <div className="flex gap-2">
        <button
          onClick={onToggleMute}
          disabled={!isCallActive}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            isMuted
              ? "bg-amber-100 hover:bg-amber-200 text-amber-700"
              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isMuted ? (
            <>
              <MicOff className="w-4 h-4" />
              Unmute
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              Mute
            </>
          )}
        </button>
        
        <button
          onClick={onEndCall}
          disabled={!isCallActive}
          className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Phone className="w-4 h-4" />
          End Call
        </button>
      </div>

      {isCallActive && (
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
          <div
            className={`w-2 h-2 rounded-full ${
              agentState === "speaking"
                ? "bg-blue-500 animate-pulse"
                : "bg-green-500 animate-pulse"
            }`}
          ></div>
          {agentState === "speaking"
            ? "Agent is speaking..."
            : agentState === "listening"
            ? "Agent is listening..."
            : "Agent is idle..."}
        </div>
      )}
    </div>
  );
}
