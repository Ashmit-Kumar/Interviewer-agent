"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sessionApi } from "@/lib/api/sessionApi";

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartInterview = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // TODO: Uncomment when backend is ready
      // const session = await sessionApi.startSession();
      // router.push(`/interview?sessionId=${session.sessionId}`);
      
      // For now, navigate directly
      router.push("/interview");
    } catch (err) {
      console.error("Failed to start interview:", err);
      setError("Failed to start interview. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-slate-50 to-slate-100">
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl max-w-md w-full mx-4">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-slate-900 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Preparing Your Interview
                </h3>
                <p className="text-sm text-slate-600">
                  Setting up the interview environment...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight text-slate-900">
          Interview Practice Platform
        </h1>
        
        <p className="text-xl text-slate-600 leading-relaxed">
          Practice live coding interviews with an AI interviewer. Get real-time
          feedback, write code collaboratively, and receive structured evaluation
          at the end.
        </p>

        <div className="space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handleStartInterview}
            disabled={isLoading}
            className="px-8 py-4 bg-slate-900 text-white rounded-lg font-semibold text-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Starting..." : "Start Interview"}
          </button>
          
          <p className="text-sm text-slate-500">
            No account required • Single session • Voice-based
          </p>
        </div>
      </div>
    </main>
  );
}
