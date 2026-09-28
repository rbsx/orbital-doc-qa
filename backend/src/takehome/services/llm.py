from __future__ import annotations

import re
from collections.abc import AsyncIterator, Sequence

from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export
from takehome.db.models import Document
from takehome.services.document_context import format_documents

agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You are a helpful legal document assistant for commercial real estate lawyers. "
        "You help lawyers review and understand documents during due diligence.\n\n"
        "IMPORTANT INSTRUCTIONS:\n"
        "- Answer questions based on the document content provided.\n"
        "- When referencing specific parts of the document, cite the relevant section or clause.\n"
        "- If the answer is not in the document, say so clearly. Do not fabricate information.\n"
        "- Be concise and precise. Lawyers value accuracy over verbosity.\n"
        "- When you reference specific content, mention the section, clause, or page."
    ),
)


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await agent.run(
        f"Generate a concise 3-5 word title for a conversation that starts with: '{user_message}'. "
        "Return only the title, nothing else."
    )
    title = str(result.output).strip().strip('"').strip("'")
    # Truncate if too long
    if len(title) > 100:
        title = title[:97] + "..."
    return title


async def chat_with_document(
    user_message: str,
    documents: Sequence[Document],
    conversation_history: list[dict[str, str]],
) -> AsyncIterator[str]:
    """Stream a response to the user's message, yielding text chunks.

    Builds a prompt that includes every document in the conversation and the
    conversation history, then streams the response from the LLM.
    """
    # Build the full prompt with context
    prompt_parts: list[str] = []

    # Add document context if available
    if any(doc.extracted_text for doc in documents):
        prompt_parts.append(
            f"The following {len(documents)} document(s) have been uploaded to this conversation. "
            "Each is wrapped in a <document> tag with its label (D1, D2, …) and filename; "
            "refer to documents by label and filename, and make clear which document each "
            "point comes from. Answer across all of them where relevant.\n"
            'Documents marked has_text="false" have no text layer (most likely scans), so you '
            "cannot read them; if the user asks about one, say so and suggest a PDF with "
            "selectable text.\n\n"
            f"{format_documents(documents)}\n"
        )
    elif documents:
        # e.g. scanned PDFs with no text layer: the user can see them in the viewer,
        # so "no document uploaded" would be wrong and confusing.
        prompt_parts.append(
            f"{len(documents)} document(s) have been uploaded, but no text could be extracted "
            "from any of them (they are most likely scanned images), so you cannot read their "
            "contents. If the user asks about them, explain this and suggest uploading PDFs "
            "with selectable text (only PDFs are supported).\n\n"
            f"{format_documents(documents)}\n"
        )
    else:
        prompt_parts.append(
            "No document has been uploaded yet. If the user asks about a document, "
            "let them know they need to upload one first.\n"
        )

    # Add conversation history
    if conversation_history:
        prompt_parts.append("Previous conversation:\n")
        for msg in conversation_history:
            role = msg["role"]
            content = msg["content"]
            if role == "user":
                prompt_parts.append(f"User: {content}\n")
            elif role == "assistant":
                prompt_parts.append(f"Assistant: {content}\n")
        prompt_parts.append("\n")

    # Add the current user message
    prompt_parts.append(f"User: {user_message}")

    full_prompt = "\n".join(prompt_parts)

    async with agent.run_stream(full_prompt) as result:
        async for text in result.stream_text(delta=True):
            yield text


def count_sources_cited(response: str) -> int:
    """Count the number of references to document sections, clauses, pages, etc."""
    patterns = [
        r"section\s+\d+",
        r"clause\s+\d+",
        r"page\s+\d+",
        r"paragraph\s+\d+",
    ]
    count = 0
    for pattern in patterns:
        count += len(re.findall(pattern, response, re.IGNORECASE))
    return count
