import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface StartSessionResponse {
  success: boolean;
  data: {
    sessionId: string;
    question: {
      title: string;
      difficulty: string;
      description: string;
      constraints: string[];
    };
    vapiConfig: {
      publicKey: string;
      agentId: string;
      metadata: {
        sessionId: string;
        agentContext: string;
      };
    };
  };
}

export interface UpdateCodeRequest {
  code: string;
}

export interface EndSessionRequest {
  finalCode: string;
}

export interface SessionResultsResponse {
  success: boolean;
  data: {
    sessionId: string;
    questionsAsked: string[];
    finalCode: string;
    transcripts: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
    }>;
    evaluation?: {
      strengths: string[];
      improvements: string[];
      edgeCases: string[];
      nextSteps: string[];
      generatedAt: string;
    };
    status: string;
  };
}

export const sessionApi = {
  async startSession(): Promise<StartSessionResponse> {
    const response = await apiClient.post("/sessions/start");
    return response.data;
  },

  async updateCode(sessionId: string, code: string): Promise<void> {
    await apiClient.put(`/sessions/${sessionId}/code`, { code });
  },

  async endSession(sessionId: string): Promise<void> {
    await apiClient.post(`/sessions/${sessionId}/end`);
  },

  async getResults(sessionId: string): Promise<SessionResultsResponse> {
    const response = await apiClient.get(`/sessions/${sessionId}/results`);
    return response.data;
  },
};
