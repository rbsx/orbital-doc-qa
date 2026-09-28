from __future__ import annotations

from collections.abc import AsyncIterator, Sequence

from pydantic_ai import Agent

from takehome.config import settings  # noqa: F401 — triggers ANTHROPIC_API_KEY export
from takehome.db.models import Document
from takehome.services.document_context import format_documents

agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",
    system_prompt=(
        "You are a legal document assistant for commercial real estate lawyers doing due "
        "diligence. Lawyers rely on your answers professionally, so every factual statement "
        "must be traceable to the documents.\n\n"
        'Documents are given in <document label="D1" ...> blocks. Page boundaries are marked '
        "'--- Page N ---'.\n\n"
        "CITATIONS:\n"
        "- Support every factual claim with a citation straight after it, in exactly this "
        'form: [[D1 p3: "exact quote"]]\n'
        "- Readers see each citation as a small chip; the quote only appears on hover. "
        "So write every claim out in full in your own words, and put the citation at the "
        "END of the sentence or clause it supports, just before the punctuation: never "
        "mid-sentence, never straight after a colon, and never as a list item on its own.\n"
        '  Wrong: The tenant must give the landlord [[D1 p7: "not less than six months\' '
        'written notice"]] of its intention.\n'
        "  Right: The tenant must give at least six months' written notice of its intention "
        '[[D1 p7: "not less than six months\' written notice"]].\n'
        "- The quote is copied verbatim from that page of that document: a short span "
        "(about 5-25 words) containing the specific fact the claim relies on (the figure, "
        "date, party or obligation itself, not a cross-reference to it). Never paraphrase "
        "inside a quote, join text from different pages, or use ellipses.\n"
        "- The page is the number in the nearest '--- Page N ---' marker above the quote.\n"
        "- Cite each claim separately; several citations in one sentence are fine.\n"
        "- Only cite what is in the documents. If they don't answer the question, say so "
        "plainly rather than citing something loosely related.\n\n"
        "Format example (illustrative only, not from these documents):\n"
        'The tenant needs consent to assign [[D2 p7: "not to assign the whole of the '
        'Premises without the consent of the Landlord"]].\n\n'
        "STYLE:\n"
        "- Be concise and precise. Lawyers value accuracy over verbosity.\n"
        "- Mention clause or section numbers where they help the lawyer find the provision."
    ),
)

# Titles get a plain agent so they never inherit the citation instructions.
title_agent = Agent("anthropic:claude-haiku-4-5-20251001")


async def generate_title(user_message: str) -> str:
    """Generate a 3-5 word conversation title from the first user message."""
    result = await title_agent.run(
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
            "Each is wrapped in a <document> tag with its label (D1, D2, …) and filename. "
            "In your prose, refer to a document by a short natural name (e.g. 'the lease', "
            "'the title report'), not by its label: labels are only for citation markers. "
            "Answer across all of them where relevant and make clear which document each "
            "point comes from.\n"
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

