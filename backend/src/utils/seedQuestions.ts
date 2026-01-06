import dotenv from 'dotenv';
import Question from '../models/Question';
import { connectDatabase } from '../config/database';

dotenv.config();

const seedQuestions = [
  {
    questionId: 'q1',
    title: 'Two Sum',
    difficulty: 'Easy',
    description:
      'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.',
    constraints: [
      '2 <= nums.length <= 10^4',
      '-10^9 <= nums[i] <= 10^9',
      '-10^9 <= target <= 10^9',
      'Only one valid answer exists',
    ],
    exampleInput: 'nums = [2,7,11,15], target = 9',
    exampleOutput: '[0,1]',
    category: 'Arrays & Hashing',
    isActive: true,
  },
  {
    questionId: 'q2',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    description:
      'Given a string s containing just the characters "(", ")", "{", "}", "[" and "]", determine if the input string is valid. An input string is valid if: Open brackets must be closed by the same type of brackets. Open brackets must be closed in the correct order. Every close bracket has a corresponding open bracket of the same type.',
    constraints: ['1 <= s.length <= 10^4', 's consists of parentheses only "()[]{}"'],
    exampleInput: 's = "()[]{}"',
    exampleOutput: 'true',
    category: 'Stack',
    isActive: true,
  },
  {
    questionId: 'q3',
    title: 'Reverse Linked List',
    difficulty: 'Easy',
    description:
      'Given the head of a singly linked list, reverse the list, and return the reversed list.',
    constraints: [
      'The number of nodes in the list is the range [0, 5000]',
      '-5000 <= Node.val <= 5000',
    ],
    exampleInput: 'head = [1,2,3,4,5]',
    exampleOutput: '[5,4,3,2,1]',
    category: 'Linked List',
    isActive: true,
  },
  {
    questionId: 'q4',
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    description:
      'Given an integer array nums, find the subarray with the largest sum, and return its sum.',
    constraints: ['1 <= nums.length <= 10^5', '-10^4 <= nums[i] <= 10^4'],
    exampleInput: 'nums = [-2,1,-3,4,-1,2,1,-5,4]',
    exampleOutput: '6 (subarray [4,-1,2,1])',
    category: 'Dynamic Programming',
    isActive: true,
  },
  {
    questionId: 'q5',
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Medium',
    description:
      'Given the root of a binary tree, return the level order traversal of its nodes values (i.e., from left to right, level by level).',
    constraints: [
      'The number of nodes in the tree is in the range [0, 2000]',
      '-1000 <= Node.val <= 1000',
    ],
    exampleInput: 'root = [3,9,20,null,null,15,7]',
    exampleOutput: '[[3],[9,20],[15,7]]',
    category: 'Tree',
    isActive: true,
  },
];

async function seedDatabase() {
  try {
    await connectDatabase();
    console.log('Connected to MongoDB');

    // Clear existing questions
    await Question.deleteMany({});
    console.log('Cleared existing questions');

    // Insert seed questions
    await Question.insertMany(seedQuestions);
    console.log(`✓ Seeded ${seedQuestions.length} questions`);

    console.log('Database seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
