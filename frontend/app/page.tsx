"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sessionApi } from "@/lib/api/sessionApi";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleStartInterview = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Step 1: Create session
      setLoadingStep("Creating interview session...");
      const sessionResponse = await sessionApi.startSession();
      const { sessionId, question } = sessionResponse.data;
      
      // Step 2: Create LiveKit room
      setLoadingStep("Connecting to voice system...");
      const roomResponse = await sessionApi.createLiveKitRoom(sessionId);
      const { roomName, candidateToken, wsUrl } = roomResponse.data;
      
      // Validate LiveKit response
      console.log('✅ LiveKit room created:', { roomName, hasToken: !!candidateToken, wsUrl });
      
      if (!candidateToken) {
        throw new Error('LiveKit token not received from backend');
      }
      
      if (!wsUrl) {
        throw new Error('LiveKit URL not received from backend');
      }
      
      // Store all data in sessionStorage
      sessionStorage.setItem('currentSession', JSON.stringify({
        sessionId,
        question,
        livekitRoomName: roomName,
        livekitToken: candidateToken,
        livekitWsUrl: wsUrl,
      }));
      
      // Navigate to interview page
      router.push(`/interview?sessionId=${sessionId}`);
    } catch (err) {
      console.error("Failed to start interview:", err);
      setError("Failed to start interview. Please try again.");
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-8 bg-slate-950 overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="glass-panel p-8 max-w-md w-full mx-4">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">
                  Preparing Your Interview
                </h3>
                <p className="text-sm text-slate-400">
                  {loadingStep || "Setting up the interview environment..."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="relative z-10 glass-panel max-w-3xl w-full p-12">
        <div className="text-center space-y-6">
          {/* Logo/Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/50 mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>

          <h1 className="text-5xl font-bold text-white mb-4">
            AI Interview Practice
          </h1>
          <p className="text-xl text-slate-300">
            Practice coding interviews with an AI interviewer
          </p>
          <p className="text-slate-400">
            Live voice conversation • Real-time coding • Instant feedback
          </p>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-center mt-8">
          <button
            onClick={handleStartInterview}
            disabled={isLoading}
            className="group relative px-12 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg shadow-lg shadow-indigo-500/50 hover:shadow-indigo-500/70 hover:scale-105"
          >
            <span className="relative z-10">Start Interview</span>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-400 to-purple-400 opacity-0 group-hover:opacity-20 blur transition-opacity"></div>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-slate-800">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-400 mb-2">Live Voice</div>
            <div className="text-sm text-slate-400">Natural conversation</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400 mb-2">Real Coding</div>
            <div className="text-sm text-slate-400">Monaco editor</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-pink-400 mb-2">AI Feedback</div>
            <div className="text-sm text-slate-400">Detailed evaluation</div>
          </div>
        </div>
      </div>
    </main>
  );
}
