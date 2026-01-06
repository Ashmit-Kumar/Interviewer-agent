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
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-800 p-6 shadow-xl">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">
        Voice Agent
      </h2>
      
      {/* Agent Status */}
      {isCallActive && (
        <div className="mb-4 flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
          <div className="flex gap-1">
            <div className={`w-1 h-8 rounded-full ${agentState === 'listening' ? 'bg-emerald-500' : 'bg-slate-600'} animate-pulse`}></div>
            <div className={`w-1 h-10 rounded-full ${agentState === 'listening' ? 'bg-emerald-500' : 'bg-slate-600'} animate-pulse-delay-75`}></div>
            <div className={`w-1 h-6 rounded-full ${agentState === 'listening' ? 'bg-emerald-500' : 'bg-slate-600'} animate-pulse-delay-150`}></div>
          </div>
          <div className="flex-1">
            <p className="text-sm text-slate-300 font-medium">
              {agentState === "speaking"
                ? "Agent is speaking..."
                : agentState === "listening"
                ? "Agent is listening..."
                : "Agent is idle..."}
            </p>
          </div>
        </div>
      )}
      
      {/* Control Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onToggleMute}
          disabled={!isCallActive}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            isMuted
              ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
              : "bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600"
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
          className="flex-1 px-4 py-2.5 bg-red-500/90 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-red-400/30"
        >
          <Phone className="w-4 h-4" />
          End Call
        </button>
      </div>
    </div>
  );
}
