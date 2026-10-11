"""Chatbot endpoint."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.chat_engine import answer_question

router = APIRouter(prefix="/api", tags=["chat"])


class ChatQuestion(BaseModel):
    question: str
    history: list = Field(default_factory=list)


@router.post("/chat")
def chat(body: ChatQuestion, db: Session = Depends(get_db)):
    q = body.question.strip()
    if not q:
        return {"answer": "Ask me something about your sales, stock, or customers.",
                "mode": "rules", "model": None, "sql": None, "rows": None, "data": None}
    history = [h for h in (body.history or [])[-6:] if isinstance(h, dict) and h.get("content")]
    return answer_question(db, q, history)
