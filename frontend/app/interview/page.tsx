"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CodeEditor from "@/components/code-editor/CodeEditor";
import TranscriptPanel from "@/components/transcript/TranscriptPanel";
import VoiceAgentPanel from "@/components/voice-agent/VoiceAgentPanel";
import InterviewHeader from "@/components/interview/InterviewHeader";

const INITIAL_CODE = `// Solve the Two Sum problem
// Given an array of integers nums and an integer target,
// return indices of the two numbers such that they add up to target.

function twoSum(nums, target) {
  // Write your solution here
  
}

// Test cases
console.log(twoSum([2,7,11,15], 9)); // [0,1]
console.log(twoSum([3,2,4], 6)); // [1,2]`;

export default function InterviewPage() {
  const router = useRouter();
  const [code, setCode] = useState(INITIAL_CODE);
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [agentState, setAgentState] = useState<"idle" | "listening" | "speaking">("listening");
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant" as const,
      content: "Hello! Let's start with a coding question. Can you solve the Two Sum problem?",
      timestamp: new Date(),
    },
    {
      id: "2",
      role: "user" as const,
      content: "Sure, I'll use a hash map approach...",
      timestamp: new Date(),
    },
  ]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    // TODO: Implement autosave to backend
  };

  const handleToggleMute = () => {
    setIsMuted(!isMuted);
    // TODO: Integrate with Vapi
  };

  const handleEndCall = async () => {
    setIsEnding(true);
    setIsCallActive(false);
    
    try {
      // TODO: Save final code to backend
      // await sessionApi.endSession(sessionId, code);
      
      // Simulate backend processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      router.push("/results");
    } catch (error) {
      console.error("Failed to end session:", error);
      setIsEnding(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {isEnding && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-slate-900 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Ending Interview
                </h3>
                <p className="text-sm text-slate-600">
                  Saving your code and generating feedback...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <InterviewHeader 
        questionTitle="Two Sum Problem" 
        sessionStatus={isCallActive ? "active" : "ended"} 
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor Panel */}
        <div className="flex-1 flex flex-col border-r border-slate-200">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Code Editor</h2>
          </div>
          <div className="flex-1">
            <CodeEditor 
              initialCode={INITIAL_CODE}
              language="javascript"
              onCodeChange={handleCodeChange}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-96 flex flex-col bg-white">
          <VoiceAgentPanel
            isMuted={isMuted}
            isCallActive={isCallActive}
            agentState={agentState}
            onToggleMute={handleToggleMute}
            onEndCall={handleEndCall}
          />
          <TranscriptPanel messages={messages} />
        </div>
      </div>
    </div>
  );
}

