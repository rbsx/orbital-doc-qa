"""How documents are labelled, shown to the LLM, and checked against quotes.

Shared by the chat, citations and the conflict check; see docs/CONTRACT.md §1–3.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from html import escape

from takehome.db.models import Document

_PAGE_MARKER = re.compile(r"^--- Page (\d+) ---$", re.MULTILINE)

# Variants the model changes when quoting: curly vs straight punctuation, double
# quotes inside a quote (swapped for single ones because the citation marker itself
# is wrapped in double quotes), and colons it adds between a table's label and value
# cells ("Registered proprietor: Bishopsgate…").
_CHAR_FOLDS = str.maketrans(
    {"‘": "'", "’": "'", "“": "'", "”": "'", '"': "'", "–": "-", "—": "-", ":": " "}
)


def sort_documents(documents: Sequence[Document]) -> list[Document]:
    """Label order (upload order)."""
    return sorted(documents, key=lambda d: d.position)


def document_label(document: Document) -> str:
    return f"D{document.position}"


def document_labels(documents: Sequence[Document]) -> dict[str, str]:
    """Map document id to its stable label: "D1", "D2", … (gaps where documents
    were removed)."""
    return {doc.id: document_label(doc) for doc in documents}


def format_documents(documents: Sequence[Document]) -> str:
    """Render a conversation's documents for a prompt, one labelled block each."""
    blocks: list[str] = []
    for doc in sort_documents(documents):
        attrs = (
            f'label="{document_label(doc)}" filename="{escape(doc.filename, quote=True)}" '
            f'pages="{doc.page_count}"'
        )
        if doc.extracted_text:
            blocks.append(f"<document {attrs}>\n{doc.extracted_text}\n</document>")
        else:
            blocks.append(f'<document {attrs} has_text="false">\n</document>')
    return "\n".join(blocks)


def page_texts(document: Document) -> dict[int, str]:
    """Split a document's extracted text into {page number: text}."""
    text = document.extracted_text or ""
    markers = list(_PAGE_MARKER.finditer(text))
    pages: dict[int, str] = {}
    for marker, following in zip(markers, [*markers[1:], None], strict=True):
        end = following.start() if following else len(text)
        pages[int(marker.group(1))] = text[marker.end() : end]
    return pages


def normalize_for_match(text: str) -> str:
    """Case-, whitespace- and punctuation-variant-insensitive form for quote matching."""
    return " ".join(text.translate(_CHAR_FOLDS).lower().split())


def quote_on_page(document: Document, page: int, quote: str) -> bool:
    """Whether `quote` appears on `page` of `document`, ignoring layout differences.

    PDF extraction breaks lines mid-sentence and the model re-flows them, so the
    comparison ignores case, runs of whitespace and curly-vs-straight punctuation.
    """
    needle = normalize_for_match(quote)
    if not needle:
        return False
    return needle in normalize_for_match(page_texts(document).get(page, ""))


def pages_with_quote(document: Document, quote: str) -> list[int]:
    """Every page of `document` that contains `quote`, in page order."""
    return [page for page in sorted(page_texts(document)) if quote_on_page(document, page, quote)]
