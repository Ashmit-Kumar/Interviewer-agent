import mongoose, { Schema, Document } from 'mongoose';

export interface ISession extends Document {
  sessionId: string;
  status: 'active' | 'ended' | 'evaluated';
  startedAt: Date;
  endedAt?: Date;
  questionsAsked: string[];
  finalCode: string;
  transcripts: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  agentNotes?: string[];  // Notes saved by Python agent during interview
  evaluation?: {
    strengths: string[];
    improvements: string[];
    edgeCases: string[];
    nextSteps: string[];
    generatedAt: Date;
  };
  vapiCallId?: string;
  metadata?: Record<string, any>;
}

const SessionSchema: Schema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'ended', 'evaluated'],
      default: 'active',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    questionsAsked: [{
      type: String,
    }],
    finalCode: {
      type: String,
      default: '',
    },
    transcripts: [{
      role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    }],
    agentNotes: [{
      type: String,
    }],
    evaluation: {
      strengths: [String],
      improvements: [String],
      edgeCases: [String],
      nextSteps: [String],
      generatedAt: Date,
    },
    vapiCallId: String,
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ISession>('Session', SessionSchema);
