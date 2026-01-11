"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { sessionApi, SessionResultsResponse } from "@/lib/api/sessionApi";

export default function ResultsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SessionResultsResponse["data"] | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setError("No session ID provided");
      setIsLoading(false);
      return;
    }

    const fetchResults = async () => {
      try {
        const response = await sessionApi.getResults(sessionId);
        
        if (response.data.status === "evaluated" && response.data.evaluation) {
          // Results are ready
          setResults(response.data);
          setIsLoading(false);
          setIsPolling(false);
        } else {
          // Still processing, continue polling
          setIsPolling(true);
          setTimeout(fetchResults, 3000); // Poll every 3 seconds
        }
      } catch (err) {
        console.error("Failed to fetch results:", err);
        setError("Failed to load results");
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [sessionId]);

  // Show loading state
  if (isLoading || isPolling) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0f172a]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 mb-2">
            {isPolling ? "Generating your feedback..." : "Loading results..."}
          </p>
          <p className="text-slate-500 text-sm">This may take a moment</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !results) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0f172a]">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "No results found"}</p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0f172a]">
      {/* Header */}
      <header className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 px-6 py-6 mb-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-white">
            Interview Results
          </h1>
          <p className="text-slate-400 mt-2">
            Here's your performance summary and feedback
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8 pb-16">
        {/* Questions Discussed */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Questions Discussed
          </h2>
          <ul className="space-y-2">
            {results.questionsAsked.map((question, idx) => (
              <li key={idx} className="flex items-center gap-2 text-slate-300">
                <span className="w-6 h-6 flex items-center justify-center bg-indigo-500/20 text-indigo-400 rounded-full text-sm font-medium">
                  {idx + 1}
                </span>
                {question}
              </li>
            ))}
          </ul>
        </section>

        {/* Final Code */}
        <section className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Final Code Submission
          </h2>
          <div className="bg-slate-950/50 rounded-lg p-4 font-mono text-sm text-slate-300 border border-slate-800 overflow-x-auto">
            <pre>{results.finalCode || "No code submitted"}</pre>
          </div>
        </section>

        {/* Feedback Sections */}
        {results.evaluation && (
          <section className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Structured Feedback
            </h2>
            
            <div className="space-y-6">
              {/* What was done well */}
              {results.evaluation.strengths.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                    ✓ What Was Done Well
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {results.evaluation.strengths.map((strength, idx) => (
                      <li key={idx}>{strength}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What could be improved */}
              {results.evaluation.improvements.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-amber-400 mb-2">
                    ⚠ What Could Be Improved
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {results.evaluation.improvements.map((improvement, idx) => (
                      <li key={idx}>{improvement}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Missing edge cases */}
              {results.evaluation.edgeCases.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-red-400 mb-2">
                    ✗ Missing Edge Cases
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {results.evaluation.edgeCases.map((edgeCase, idx) => (
                      <li key={idx}>{edgeCase}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              {results.evaluation.nextSteps.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-indigo-400 mb-2">
                    → Next Steps for Preparation
                  </h3>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    {results.evaluation.nextSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Transcripts */}
        {results.transcripts && results.transcripts.length > 0 && (
          <section className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Interview Transcript
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {results.transcripts.map((transcript, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    {transcript.role === "assistant" ? "AI Interviewer" : "You"}
                  </div>
                  <div
                    className={`p-3 rounded-xl text-sm max-w-[85%] ${
                      transcript.role === "assistant"
                        ? "bg-blue-500/10 border border-blue-500/20 rounded-bl-none text-blue-100"
                        : "bg-slate-700/30 border border-slate-600/30 rounded-br-none text-slate-200 ml-auto"
                    }`}
                  >
                    {transcript.content}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="flex justify-center">
          <button
            onClick={() => router.push("/")}
            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg font-semibold transition-all shadow-lg shadow-indigo-500/50 hover:scale-105"
          >
            Start New Interview
          </button>
        </div>
      </main>
    </div>
  );
}
