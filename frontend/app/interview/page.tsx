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
    <div className="h-screen flex flex-col bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0f172a]">
      {isEnding && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="bg-slate-800/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl shadow-indigo-500/10 max-w-md w-full mx-4 border border-white/10">
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
      <div className="h-full grid grid-cols-[35%_1fr] gap-4 p-4 overflow-hidden text-slate-200 font-sans">
        {/* Left Panel (35%) - Question Card */}
        <div className="h-full flex flex-col overflow-hidden">
          {/* Single Tall Question Card with Enhanced Glass Effect */}
          <div className="h-full bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 p-8 flex flex-col overflow-y-auto">
            {/* Difficulty Badge */}
            <div className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-md mb-6 self-start">
              {currentQuestion.difficulty}
            </div>
            
            {/* Title */}
            <h1 className="text-3xl font-bold text-white mb-6">
              {currentQuestion.title}
            </h1>
            
            {/* Description */}
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              {currentQuestion.description}
            </p>
            
            {/* Constraints */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">Constraints</h3>
              <ul className="space-y-2">
                {currentQuestion.constraints.map((constraint, idx) => (
                  <li key={idx} className="text-xs text-slate-400 flex items-start font-mono">
                    <span className="mr-2">•</span>
                    <span>{constraint}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Voice Agent Section at Bottom */}
            <div className="mt-auto pt-6 border-t border-white/10">
              <div className="space-y-4">
                {/* Agent Status */}
                {isCallActive && (
                  <div className="flex items-center gap-3 p-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10">
                    <div className="flex gap-1">
                      <div className={`w-1 h-8 rounded-full ${agentState === 'listening' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'} animate-pulse`}></div>
                      <div className={`w-1 h-10 rounded-full ${agentState === 'listening' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'} animate-pulse-delay-75`}></div>
                      <div className={`w-1 h-6 rounded-full ${agentState === 'listening' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'} animate-pulse-delay-150`}></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-slate-300 font-medium">
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
        <div className="h-full flex flex-col gap-4 overflow-hidden">
          {/* Code Editor (Top Large Section) with Enhanced Glass Effect */}
          <div className="flex-[2] flex flex-col bg-[#1e1e1e]/80 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden">
            {/* Editor Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/5 border-b border-white/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-blue-400 font-mono text-sm border-b border-blue-400 pb-1">solution.js</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleToggleMute}
                  disabled={!isCallActive}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  Mute
                </button>
                <button 
                  onClick={handleEndCall}
                  disabled={!isCallActive}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
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

          {/* AI Transcription (Bottom Small Section) with Enhanced Glass Effect */}
          <div className="flex-1 flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 overflow-hidden flex-shrink-0 relative">
            {/* Transcription Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-200">AI Transcription</h2>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Live Session</span>
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
                <div key={message.id} className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  {message.role === "assistant" ? "AI Interviewer" : "You"}
                  </div>
                  <div
                  className={`p-3 rounded-xl text-sm max-w-[85%] ${
                    message.role === "assistant"
                    ? "bg-blue-500/10 border border-blue-500/20 rounded-bl-none text-blue-100"
                    : "bg-slate-700/30 border border-slate-600/30 rounded-br-none text-slate-200 ml-auto"
                  }`}
                  >
                  {message.content}
                  </div>
                </div>
                ))}
              </>
              )}
            </div>

            {/* AI Analyzing Progress Bar at Bottom */}
            <div className="absolute bottom-4 left-4 right-4 text-center">
              <div className="w-full h-[2px] bg-slate-700 rounded-full mb-2 overflow-hidden">
                <div className="w-1/3 h-full bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6] animate-pulse"></div>
              </div>
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">AI is analyzing...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

