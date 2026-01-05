"use client";

import { Editor } from "@monaco-editor/react";
import { useState } from "react";

interface CodeEditorProps {
  initialCode?: string;
  language?: string;
  onCodeChange?: (code: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({
  initialCode = "",
  language = "javascript",
  onCodeChange,
  readOnly = false,
}: CodeEditorProps) {
  const [code, setCode] = useState(initialCode);

  const handleEditorChange = (value: string | undefined) => {
    const newCode = value || "";
    setCode(newCode);
    onCodeChange?.(newCode);
  };

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        defaultLanguage={language}
        value={code}
        onChange={handleEditorChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          readOnly,
        }}
      />
    </div>
  );
}
