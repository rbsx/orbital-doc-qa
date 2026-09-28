from __future__ import annotations

import os
import re

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from takehome.db.models import DEFAULT_CONVERSATION_TITLE, Conversation, Message

logger = structlog.get_logger()


async def create_conversation(session: AsyncSession) -> Conversation:
    """Create a new conversation with default title."""
    conversation = Conversation()
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def list_conversations(session: AsyncSession) -> list[Conversation]:
    """List all conversations ordered by most recently updated."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.documents))
        .order_by(Conversation.updated_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_conversation(session: AsyncSession, conversation_id: str) -> Conversation | None:
    """Get a single conversation with its documents eagerly loaded."""
    stmt = (
        select(Conversation)
        .options(selectinload(Conversation.documents))
        .where(Conversation.id == conversation_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_conversation(
    session: AsyncSession, conversation_id: str, title: str
) -> Conversation | None:
    """Update the title of a conversation."""
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        return None
    conversation.title = title
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def touch_conversation(session: AsyncSession, conversation_id: str) -> None:
    """Mark a conversation as active now so the sidebar lists it first.

    `onupdate` only fires when the conversation row itself changes, not when
    messages or documents are added to it.
    """
    await session.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(updated_at=func.now())
    )
    await session.commit()


def title_from_filename(filename: str) -> str:
    """ "02-report-on-title-100-bishopsgate.pdf" -> "Report on title 100 bishopsgate"."""
    stem = re.sub(r"\.pdf$", "", filename, flags=re.IGNORECASE)
    stem = re.sub(r"^\d{1,3}[\s_.-]+", "", stem)  # ordering prefixes, not years
    title = " ".join(re.sub(r"[-_.]+", " ", stem).split()) or filename
    return (title[0].upper() + title[1:])[:100]


async def title_from_first_document(
    session: AsyncSession, conversation_id: str, filename: str
) -> None:
    """Name a still-untitled chat after its first document.

    Only until the first question: that generates a title describing what the
    lawyer is actually asking about, which is more useful.
    """
    conversation = await get_conversation(session, conversation_id)
    if conversation is None or conversation.title != DEFAULT_CONVERSATION_TITLE:
        return
    has_messages = await session.scalar(
        select(Message.id).where(Message.conversation_id == conversation_id).limit(1)
    )
    if has_messages is None:
        await update_conversation(session, conversation_id, title_from_filename(filename))


async def delete_conversation(session: AsyncSession, conversation_id: str) -> bool:
    """Delete a conversation and its uploaded files. Returns True if it existed.

    The PDFs are client documents, so they shouldn't outlive the conversation on
    disk. They go only once the database delete has committed: a failed delete
    must not leave rows pointing at files that no longer exist.
    """
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        return False
    file_paths = [doc.file_path for doc in conversation.documents]
    await session.delete(conversation)
    await session.commit()

    for path in file_paths:
        try:
            os.remove(path)
        except FileNotFoundError:
            logger.warning("Uploaded file already gone", path=path, conversation_id=conversation_id)
        except OSError:
            logger.exception("Failed to remove uploaded file", path=path, conversation_id=conversation_id)
    return True
