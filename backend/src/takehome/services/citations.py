"""Parse the inline citations in an answer and check each against its source.

The model cites as `[[D2 p4: "exact quote"]]` (docs/CONTRACT.md §3). A citation is
only marked verified when the quote really appears on that page of that document,
so a lawyer can tell a checked source from one the model may have invented.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from takehome.db.models import Document
from takehome.services.document_context import document_labels, quote_on_page

# Lenient on spacing and "p4" vs "p. 4"; the quote runs to the closing `"]]`.
CITATION_PATTERN = re.compile(r'\[\[\s*(D\d+)\s+p\.?\s*(\d+)\s*:\s*"(.+?)"\s*\]\]', re.DOTALL)


@dataclass(frozen=True)
class Citation:
    document_id: str | None  # None when the label doesn't match any document
    label: str
    page: int
    quote: str
    verified: bool


def extract_citations(answer: str, documents: Sequence[Document]) -> list[Citation]:
    """All citations in `answer`, in order of appearance, each checked against its page."""
    labels = document_labels(documents)
    by_label = {labels[doc.id]: doc for doc in documents}
    citations: list[Citation] = []
    for match in CITATION_PATTERN.finditer(answer):
        label, page, quote = match.group(1), int(match.group(2)), match.group(3).strip()
        document = by_label.get(label)
        citations.append(
            Citation(
                document_id=document.id if document else None,
                label=label,
                page=page,
                quote=quote,
                verified=document is not None and quote_on_page(document, page, quote),
            )
        )
    return citations
