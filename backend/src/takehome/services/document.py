from __future__ import annotations

import os
import uuid

import fitz  # PyMuPDF
import structlog
from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.config import settings
from takehome.db.models import Document
from takehome.services.document_context import sort_documents

logger = structlog.get_logger()


async def upload_document(
    session: AsyncSession, conversation_id: str, file: UploadFile
) -> Document:
    """Upload and process a PDF document for a conversation.

    Validates the file is a PDF, saves it to disk, extracts text using PyMuPDF,
    and stores metadata in the database.

    Raises ValueError if the file is not a PDF, or if it would take the conversation
    past its document or text limits (every document is sent with every question).
    """
    existing_count, existing_chars = await _conversation_text_usage(session, conversation_id)
    if existing_count >= settings.max_documents_per_conversation:
        raise ValueError(
            f"This conversation already has {existing_count} documents, the most it can hold. "
            "Start a new conversation for further documents."
        )

    # Validate file type
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        filename = file.filename or ""
        if not filename.lower().endswith(".pdf"):
            raise ValueError("Only PDF files are supported.")

    # Read file content
    content = await file.read()

    # Validate file size
    if len(content) > settings.max_upload_size:
        raise ValueError(
            f"File too large. Maximum size is {settings.max_upload_size // (1024 * 1024)}MB."
        )

    # Generate a unique filename to avoid collisions
    original_filename = file.filename or "document.pdf"
    unique_name = f"{uuid.uuid4().hex}_{original_filename}"
    file_path = os.path.join(settings.upload_dir, unique_name)

    # Ensure upload directory exists
    os.makedirs(settings.upload_dir, exist_ok=True)

    # Save the file to disk
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info("Saved uploaded PDF", filename=original_filename, path=file_path, size=len(content))

    # Extract text using PyMuPDF
    extracted_text = ""
    page_count = 0
    try:
        doc = fitz.open(file_path)
        page_count = len(doc)
        pages: list[str] = []
        for page_num in range(page_count):
            page = doc[page_num]
            text = page.get_text()  # type: ignore[union-attr]
            if text.strip():
                pages.append(f"--- Page {page_num + 1} ---\n{text}")
        extracted_text = "\n\n".join(pages)
        doc.close()
    except Exception:
        logger.exception("Failed to extract text from PDF", filename=original_filename)
        extracted_text = ""

    logger.info(
        "Extracted text from PDF",
        filename=original_filename,
        page_count=page_count,
        text_length=len(extracted_text),
    )

    if existing_chars + len(extracted_text) > settings.max_conversation_text_chars:
        os.remove(file_path)
        raise ValueError(
            f"{original_filename} can't be added: the assistant reads every document in a "
            "conversation at once, and this one would take the conversation past its limit "
            f"of {settings.max_conversation_text_chars:,} characters of text. "
            "Start a new conversation for it."
        )

    # Create the document record
    document = Document(
        conversation_id=conversation_id,
        filename=original_filename,
        file_path=file_path,
        extracted_text=extracted_text if extracted_text else None,
        page_count=page_count,
    )
    session.add(document)
    await session.commit()
    await session.refresh(document)
    return document


async def get_document(session: AsyncSession, document_id: str) -> Document | None:
    """Get a document by its ID."""
    stmt = select(Document).where(Document.id == document_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_documents_for_conversation(
    session: AsyncSession, conversation_id: str
) -> list[Document]:
    """A conversation's documents in label order (D1, D2, …)."""
    stmt = select(Document).where(Document.conversation_id == conversation_id)
    result = await session.execute(stmt)
    return sort_documents(result.scalars().all())


async def _conversation_text_usage(
    session: AsyncSession, conversation_id: str
) -> tuple[int, int]:
    """How many documents a conversation has and how much extracted text they hold."""
    stmt = select(
        func.count(Document.id),
        func.coalesce(func.sum(func.length(Document.extracted_text)), 0),
    ).where(Document.conversation_id == conversation_id)
    count, chars = (await session.execute(stmt)).one()
    return int(count), int(chars)
