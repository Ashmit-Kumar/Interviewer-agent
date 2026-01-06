import mongoose, { Schema, Document } from 'mongoose';

export interface IQuestion extends Document {
  questionId: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  constraints: string[];
  exampleInput?: string;
  exampleOutput?: string;
  hints?: string[];
  category: string;
  isActive: boolean;
}

const QuestionSchema: Schema = new Schema(
  {
    questionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    constraints: [{
      type: String,
    }],
    exampleInput: String,
    exampleOutput: String,
    hints: [String],
    category: {
      type: String,
      default: 'General',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IQuestion>('Question', QuestionSchema);
