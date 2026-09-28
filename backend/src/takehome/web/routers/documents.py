from __future__ import annotations

import os
from collections.abc import Sequence
from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import FileResponse

from takehome.db.models import Document
from takehome.db.session import get_session
from takehome.services.conversation import get_conversation, touch_conversation
from takehome.services.document import (
    PasswordProtectedError,
    get_document,
    list_documents_for_conversation,
    upload_document,
)
from takehome.services.document_context import document_labels, sort_documents

logger = structlog.get_logger()

router = APIRouter(tags=["documents"])


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #


class DocumentOut(BaseModel):
    id: str
    conversation_id: str
    label: str
    filename: str
    page_count: int
    has_text: bool
    uploaded_at: datetime

    model_config = {"from_attributes": True}


def documents_out(documents: Sequence[Document]) -> list[DocumentOut]:
    """A conversation's documents as the API shows them: labelled, in label order."""
    labels = document_labels(documents)
    return [
        DocumentOut(
            id=doc.id,
            conversation_id=doc.conversation_id,
            label=labels[doc.id],
            filename=doc.filename,
            page_count=doc.page_count,
            has_text=doc.extracted_text is not None,
            uploaded_at=doc.uploaded_at,
        )
        for doc in sort_documents(documents)
    ]


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post(
    "/api/conversations/{conversation_id}/documents",
    response_model=DocumentOut,
    status_code=201,
)
async def upload_document_endpoint(
    conversation_id: str,
    file: UploadFile,
    session: AsyncSession = Depends(get_session),
) -> DocumentOut:
    """Add a PDF document to a conversation.

    One file per request, so the client can report progress and errors per file.
    Returns 400 if the file isn't a PDF or would exceed the conversation's limits.
    """
    # Verify the conversation exists
    conversation = await get_conversation(session, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        document = await upload_document(session, conversation_id, file)
    except PasswordProtectedError as e:
        # A code as well as the message, so the UI can show a locked state.
        raise HTTPException(
            status_code=400, detail={"code": "password_protected", "message": str(e)}
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await touch_conversation(session, conversation_id)

    logger.info(
        "Document uploaded",
        conversation_id=conversation_id,
        document_id=document.id,
        filename=document.filename,
    )

    # The label depends on the documents already in the conversation.
    documents = await list_documents_for_conversation(session, conversation_id)
    return next(d for d in documents_out(documents) if d.id == document.id)


@router.get("/api/documents/{document_id}/content")
async def serve_document_file(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Serve the raw PDF file for download/viewing."""
    document = await get_document(session, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=document.file_path,
        filename=document.filename,
        media_type="application/pdf",
    )
