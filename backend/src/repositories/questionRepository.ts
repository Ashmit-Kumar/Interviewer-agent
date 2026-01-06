import Question, { IQuestion } from '../models/Question';
import { ApiError } from '../middlewares/errorHandler';

export class QuestionRepository {
  async findAll(filters?: { difficulty?: string; category?: string }): Promise<IQuestion[]> {
    try {
      const query: any = { isActive: true };
      if (filters?.difficulty) query.difficulty = filters.difficulty;
      if (filters?.category) query.category = filters.category;

      return await Question.find(query);
    } catch (error) {
      throw new ApiError(500, 'Failed to fetch questions');
    }
  }

  async findByQuestionId(questionId: string): Promise<IQuestion | null> {
    try {
      return await Question.findOne({ questionId, isActive: true });
    } catch (error) {
      throw new ApiError(500, 'Failed to fetch question');
    }
  }

  async getRandomQuestion(difficulty?: string): Promise<IQuestion | null> {
    try {
      const query: any = { isActive: true };
      if (difficulty) query.difficulty = difficulty;

      const count = await Question.countDocuments(query);
      if (count === 0) return null;

      const random = Math.floor(Math.random() * count);
      const questions = await Question.find(query).limit(1).skip(random);
      
      return questions[0] || null;
    } catch (error) {
      throw new ApiError(500, 'Failed to fetch random question');
    }
  }

  async create(questionData: Partial<IQuestion>): Promise<IQuestion> {
    try {
      const question = new Question(questionData);
      return await question.save();
    } catch (error) {
      throw new ApiError(500, 'Failed to create question');
    }
  }
}
