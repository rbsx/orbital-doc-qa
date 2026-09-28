from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.db.session import get_session
from takehome.services.conflicts import ConflictCheckError, ConflictReport, get_conflict_report
from takehome.services.conversation import get_conversation

router = APIRouter(tags=["conflicts"])


@router.get("/api/conversations/{conversation_id}/conflicts", response_model=ConflictReport)
async def get_conflicts_endpoint(
    conversation_id: str,
    session: AsyncSession = Depends(get_session),
) -> ConflictReport:
    """Likely conflicts between the conversation's documents.

    Served from the cache when this set of documents has been checked before;
    otherwise runs the check, which takes a while.
    """
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        return await get_conflict_report(session, conversation)
    except ConflictCheckError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
