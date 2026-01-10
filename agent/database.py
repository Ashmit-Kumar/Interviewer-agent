"""
Database utilities for MongoDB operations
"""

from pymongo import MongoClient
from bson import ObjectId
from typing import Optional, Dict, Any
import os


class Database:
    """MongoDB database connection and operations"""
    
    def __init__(self):
        self.client = MongoClient(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
        self.db = self.client["interview_platform"]
        
        # Collections
        self.sessions = self.db["sessions"]
        self.questions = self.db["questions"]
        self.transcripts = self.db["transcripts"]
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session by sessionId field (not MongoDB _id)"""
        return self.sessions.find_one({"sessionId": session_id})
    
    def get_question(self, question_id: str) -> Optional[Dict[str, Any]]:
        """Get question by ID"""
        try:
            return self.questions.find_one({"_id": ObjectId(question_id)})
        except:
            return self.questions.find_one({"questionId": question_id})
    
    def update_session(self, session_id: str, update_data: Dict[str, Any]) -> bool:
        """Update session data using sessionId field"""
        result = self.sessions.update_one(
            {"sessionId": session_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def add_transcript(self, session_id: str, role: str, content: str) -> bool:
        """Add transcript entry to session using sessionId field"""
        result = self.sessions.update_one(
            {"sessionId": session_id},
            {"$push": {"transcripts": {"role": role, "content": content, "timestamp": None}}}
        )
        return result.modified_count > 0
    
    def close(self):
        """Close database connection"""
        self.client.close()


# Global database instance
db = Database()
