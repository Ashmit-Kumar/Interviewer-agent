interface InterviewHeaderProps {
  questionTitle: string;
  sessionStatus: "active" | "ended";
}

export default function InterviewHeader({
  questionTitle,
  sessionStatus,
}: InterviewHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Coding Interview Session
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Question: {questionTitle}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                sessionStatus === "active" ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <span className="text-sm text-slate-600">
              Session {sessionStatus === "active" ? "Active" : "Ended"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
