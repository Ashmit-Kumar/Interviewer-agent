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
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.client = MongoClient(uri)
        # Match backend: "interview-platform"
        self.db = self.client["interview_platform"]
        
        self.sessions = self.db["sessions"]
        self.questions = self.db["questions"]
        self.transcripts = self.db["transcripts"]
        print(f"🔌 [DB_INIT] Connected to: {self.db.name}")
    def print_all_sessions(self):
            """Dumps every session ID in the DB to the console."""
            try:
                print("\n--- 📊 CURRENT DATABASE DUMP ---")
                all_docs = list(self.sessions.find({}))
                if not all_docs:
                    print("❌ [EMPTY] No documents found in the 'sessions' collection.")
                for doc in all_docs:
                    print(f"ID: {doc.get('sessionId')} | Status: {doc.get('status')} | Metadata: {doc.get('metadata')}")
                print("--------------------------------\n")
            except Exception as e:
                print(f"❌ [DUMP_ERROR] {e}")
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        print(f"🔎 [DB_QUERY] Searching for sessionId: '{session_id}'")
        return self.sessions.find_one({"sessionId": session_id})

    def get_question_by_id(self, question_id: str) -> Optional[Dict[str, Any]]:
        print(f"🔎 [DB_QUERY] Searching for questionId: '{question_id}'")
        try:
            return self.questions.find_one({"questionId": question_id})
        except Exception as e:
            print(f"❌ [DB_ERR] Question fetch error: {e}")
            return None

    def get_debug_info(self):
        """Helper to see what's actually in the DB when a fetch fails"""
        try:
            count = self.sessions.count_documents({})
            sample_ids = [doc.get("sessionId") for doc in self.sessions.find().limit(5)]
            return {"total_sessions": count, "recent_ids": sample_ids}
        except:
            return "Could not fetch debug info"

    def update_session(self, session_id: str, update_data: Dict[str, Any]) -> bool:
        result = self.sessions.update_one({"sessionId": session_id}, {"$set": update_data})
        return result.modified_count > 0


    # Backwards-compatible alias
    def get_question(self, question_id: str) -> Optional[Dict[str, Any]]:
        return self.get_question_by_id(question_id)
    
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
