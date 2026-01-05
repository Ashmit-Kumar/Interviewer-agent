"use client";

import { useRouter } from "next/navigation";

export default function ResultsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900">
            Interview Results
          </h1>
          <p className="text-slate-600 mt-2">
            Here's your performance summary and feedback
          </p>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Questions Discussed */}
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Questions Discussed
          </h2>
          <ul className="space-y-2">
            <li className="flex items-center gap-2 text-slate-700">
              <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                1
              </span>
              Two Sum Problem
            </li>
          </ul>
        </section>

        {/* Final Code */}
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Final Code Submission
          </h2>
          <div className="bg-slate-50 rounded-lg p-4 font-mono text-sm text-slate-800">
            {/* Code will be displayed here */}
            <pre>
              {`function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
  return [];
}`}
            </pre>
          </div>
        </section>

        {/* Feedback Sections */}
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Structured Feedback
          </h2>
          
          <div className="space-y-6">
            {/* What was done well */}
            <div>
              <h3 className="text-lg font-semibold text-green-700 mb-2">
                ✓ What Was Done Well
              </h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Clear explanation of the hash map approach</li>
                <li>Correct time complexity analysis</li>
                <li>Clean and readable code</li>
              </ul>
            </div>

            {/* What could be improved */}
            <div>
              <h3 className="text-lg font-semibold text-amber-700 mb-2">
                ⚠ What Could Be Improved
              </h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Could have discussed space complexity tradeoffs</li>
                <li>Initial approach explanation was a bit rushed</li>
              </ul>
            </div>

            {/* Missing edge cases */}
            <div>
              <h3 className="text-lg font-semibold text-red-700 mb-2">
                ✗ Missing Edge Cases
              </h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Empty array handling not discussed</li>
                <li>Duplicate values scenario</li>
              </ul>
            </div>

            {/* Next steps */}
            <div>
              <h3 className="text-lg font-semibold text-blue-700 mb-2">
                → Next Steps for Preparation
              </h3>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Practice more hash table problems</li>
                <li>Focus on edge case identification</li>
                <li>Work on communication clarity</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
          >
            Start New Interview
          </button>
        </div>
      </main>
    </div>
  );
}
