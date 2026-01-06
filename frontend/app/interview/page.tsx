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
  const [currentQuestion, setCurrentQuestion] = useState({
    title: "Two Sum",
    difficulty: "Easy",
    description: "Given an array of integers 'nums' and an integer 'target', return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
    constraints: [
      "2 ≤ nums.length ≤ 10⁴",
      "-10⁹ ≤ nums[i] ≤ 10⁹",
      "-10⁹ ≤ target ≤ 10⁹",
      "Only one valid answer exists"
    ]
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isCallActive, setIsCallActive] = useState(true);
  const [isEnding, setIsEnding] = useState(false);
  const [agentState, setAgentState] = useState<"idle" | "listening" | "speaking">("listening");
  const [messages, setMessages] = useState([
    {
      id: "1",
      role: "assistant" as const,
      content: "Hello! I'm your AI interviewer today. Let's start with the Two Sum problem. Take a moment to read it, and let me know when you're ready to discuss your approach.",
      timestamp: new Date(),
    },
    {
      id: "2",
      role: "user" as const,
      content: "I think I can use a hash map to solve this efficiently...",
      timestamp: new Date(),
    },
    {
      id: "3",
      role: "assistant" as const,
      content: "Great! Can you explain your approach step by step?",
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
    <div className="h-screen flex flex-col bg-slate-950">
      {isEnding && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-800 rounded-lg p-8 shadow-xl max-w-md w-full mx-4 border border-slate-700">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">
                  Ending Interview
                </h3>
                <p className="text-sm text-slate-400">
                  Saving your code and generating feedback...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - 35/65 Grid Layout */}
      <div className="h-full grid grid-cols-[35%_65%] gap-6 p-6 overflow-hidden">
        {/* Left Panel (35%) - Question Card */}
        <div className="h-full flex flex-col overflow-hidden">
          {/* Single Tall Question Card with Glass Effect */}
          <div className="h-full bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-lg shadow-xl p-8 flex flex-col overflow-y-auto">
            {/* Difficulty Badge */}
            <div className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full mb-6 self-start">
              {currentQuestion.difficulty}
            </div>
            
            {/* Title */}
            <h1 className="text-3xl font-bold text-white mb-6">
              {currentQuestion.title}
            </h1>
            
            {/* Description */}
            <p className="text-slate-300 text-base leading-relaxed mb-8">
              {currentQuestion.description}
            </p>
            
            {/* Constraints */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Constraints</h3>
              <ul className="space-y-2">
                {currentQuestion.constraints.map((constraint, idx) => (
                  <li key={idx} className="text-sm text-slate-400 flex items-start">
                    <span className="mr-2">•</span>
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Voice Agent Section at Bottom */}
            <div className="mt-auto pt-6 border-t border-slate-800">
              <div className="space-y-4">
                {/* Agent Status */}
                {isCallActive && (
                  <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
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
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel (65%) - Code Editor & Transcription */}
        <div className="h-full flex flex-col gap-6 overflow-hidden">
          {/* Code Editor (Top Large Section - 60% height) with Glass Effect */}
          <div className="flex-1 flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-lg shadow-xl overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-slate-900/60 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-indigo-400 font-medium">solution.js</span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleToggleMute}
                  disabled={!isCallActive}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-300 hover:text-white transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded border border-slate-700 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  Mute
                </button>
                <button 
                  onClick={handleEndCall}
                  disabled={!isCallActive}
                  className="px-4 py-1.5 bg-red-500/90 hover:bg-red-500 text-white text-xs font-medium rounded transition-all disabled:opacity-50 border border-red-400/30"
                >
                  End Interview
                </button>
              </div>
            </div>
            
            {/* Monaco Editor */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <CodeEditor 
                initialCode={INITIAL_CODE}
                language="javascript"
                onCodeChange={handleCodeChange}
              />
            </div>
          </div>

          {/* AI Transcription (Bottom Small Section) with Glass Effect */}
          <div className="h-[280px] flex flex-col bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-lg shadow-xl overflow-hidden flex-shrink-0">
            {/* Transcription Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-slate-900/60 border-b border-slate-800 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-300">AI Transcription</h2>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-slate-400">Live Session</span>
              </div>
            </div>
            
            {/* Transcription Content - Inline with proper overflow */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="text-center text-slate-500 text-sm mt-8">
                  AI is analyzing...
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div key={message.id} className="space-y-1">
                      <div className="text-xs text-slate-500">
                        {message.role === "assistant" ? "AI Interviewer" : "You"}
                      </div>
                      <div
                        className={`rounded-lg px-4 py-2.5 text-sm max-w-[85%] ${
                          message.role === "assistant"
                            ? "bg-slate-700/50 text-slate-200"
                            : "bg-indigo-600/50 text-slate-100"
                        }`}
                      >
                        {message.content}
                      </div>
                    </div>
                  ))}
                  
                  {/* AI Analyzing Footer */}
                  <div className="flex justify-center pt-2">
                    <div className="text-sm text-slate-500">AI is analyzing...</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

