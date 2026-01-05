"use client";

import { ReactNode } from "react";
import CodeEditor from "../code-editor/CodeEditor";
import TranscriptPanel from "../transcript/TranscriptPanel";
import VoiceAgentPanel from "../voice-agent/VoiceAgentPanel";

interface InterviewLayoutProps {
  header: ReactNode;
  codeEditorProps: {
    initialCode?: string;
    onCodeChange?: (code: string) => void;
  };
  transcriptMessages: Array<{
    id: string;
    role: "assistant" | "user";
    content: string;
    timestamp: Date;
  }>;
  voiceAgentProps: {
    isMuted: boolean;
    isCallActive: boolean;
    agentState: "idle" | "listening" | "speaking";
    onToggleMute: () => void;
    onEndCall: () => void;
  };
}

export default function InterviewLayout({
  header,
  codeEditorProps,
  transcriptMessages,
  voiceAgentProps,
}: InterviewLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {header}

      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor Panel */}
        <div className="flex-1 flex flex-col border-r border-slate-200">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">
              Code Editor
            </h2>
          </div>
          <div className="flex-1">
            <CodeEditor {...codeEditorProps} />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-96 flex flex-col bg-white">
          <VoiceAgentPanel {...voiceAgentProps} />
          <TranscriptPanel messages={transcriptMessages} />
        </div>
      </div>
    </div>
  );
}
