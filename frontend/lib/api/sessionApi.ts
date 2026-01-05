import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface StartSessionResponse {
  sessionId: string;
  questionTitle: string;
  questionDescription: string;
  vapiAssistantId: string;
}

export interface UpdateCodeRequest {
  code: string;
}

export interface EndSessionRequest {
  finalCode: string;
}

export interface SessionResultsResponse {
  sessionId: string;
  questions: string[];
  finalCode: string;
  evaluation: {
    strengths: string[];
    improvements: string[];
    missingEdgeCases: string[];
    nextSteps: string[];
  };
}

export const sessionApi = {
  async startSession(): Promise<StartSessionResponse> {
    const response = await apiClient.post("/api/session/start");
    return response.data;
  },

  async updateCode(sessionId: string, code: string): Promise<void> {
    await apiClient.put(`/api/session/${sessionId}/code`, { code });
  },

  async endSession(sessionId: string, finalCode: string): Promise<void> {
    await apiClient.post(`/api/session/${sessionId}/end`, { finalCode });
  },

  async getResults(sessionId: string): Promise<SessionResultsResponse> {
    const response = await apiClient.get(`/api/session/${sessionId}/results`);
    return response.data;
  },
};
