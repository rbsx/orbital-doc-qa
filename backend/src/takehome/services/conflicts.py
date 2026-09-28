"""Cross-document conflict check: where do a conversation's documents disagree?

One structured model call over all documents proposes conflicts, each backed by
quotes. Every quote is then checked against the document text and anything that
doesn't verify is dropped, so a lawyer only sees conflicts they can check at the
source. Reports are cached per set of documents; see docs/CONTRACT.md §5.
"""

from __future__ import annotations

import asyncio
import hashlib
import time
from collections.abc import Sequence
from typing import Literal

import structlog
from pydantic import BaseModel, Field
from pydantic_ai import Agent
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from takehome.db.models import ConflictCheck, Conversation, Document
from takehome.db.session import async_session
from takehome.services.document_context import (
    document_labels,
    format_documents,
    normalize_for_match,
    page_texts,
    quote_on_page,
    sort_documents,
)

logger = structlog.get_logger()

# Part of the cache key: bump it when the prompt or the verification changes so
# stale reports are recomputed rather than served.
ANALYSIS_VERSION = "3"

Severity = Literal["high", "medium", "low"]


# --------------------------------------------------------------------------- #
# Report (API shape, CONTRACT §5)
# --------------------------------------------------------------------------- #


class ConflictSource(BaseModel):
    document_id: str
    label: str
    page: int
    quote: str


class Conflict(BaseModel):
    id: str
    title: str
    severity: Severity
    summary: str
    sources: list[ConflictSource]


class ConflictReport(BaseModel):
    status: Literal["not_applicable", "ready"]
    conflicts: list[Conflict]


class ConflictCheckError(Exception):
    """The analysis couldn't be run; the message is safe to show to the user."""


# --------------------------------------------------------------------------- #
# Model output
# --------------------------------------------------------------------------- #


class _ProposedSource(BaseModel):
    document: str = Field(description='Label of the document quoted, e.g. "D1".')
    page: int = Field(
        description="Page the quote is on: the number in the nearest '--- Page N ---' marker above it."
    )
    quote: str = Field(
        description="Exact words copied from that page, at most about 25 words, no ellipses."
    )


class _ProposedConflict(BaseModel):
    title: str = Field(description="Short neutral headline, at most about 8 words.")
    severity: Severity
    summary: str = Field(
        description="One or two sentences: what each document says (by label) and why it matters."
    )
    sources: list[_ProposedSource] = Field(
        description="At least two quotes, from at least two different documents."
    )


class _Analysis(BaseModel):
    # Filled in first: making the model walk through each topic before it commits
    # to a list noticeably improves recall (a single pass tended to stop after the
    # first conflict or two). Not shown to the user.
    comparison: list[str] = Field(
        description=(
            "One short line per topic, comparing what each document says about it: "
            "parties and ownership; the property and its extent; floor areas and "
            "measurements; permitted use versus covenants and restrictions; term, dates, "
            "rent and prices; charges, leases and other interests. Note any mismatch."
        )
    )
    conflicts: list[_ProposedConflict]


SYSTEM_PROMPT = """\
You review the documents for a commercial real estate transaction on behalf of a \
lawyer doing due diligence. Your only task is to find genuine inconsistencies \
BETWEEN the documents: places where two documents state things about the same \
subject that cannot both be right, or where one document's terms are prohibited or \
contradicted by another.

Typical examples:
- a party in one document (landlord, seller, owner) is not the owner or party shown \
in another;
- a use, alteration or right granted by one document is prohibited or restricted by \
a covenant, restriction or condition in another;
- the same area, measurement, date, term, rent, price or other figure is stated \
differently;
- a charge, lease, easement or other interest recorded in one document contradicts a \
statement in another.

Do NOT report:
- issues, ambiguities or drafting points within a single document;
- general risks, missing information, or things a document simply does not mention;
- the same fact described in different words, or differences that are explained in \
the documents themselves;
- anything that requires speculation or assumptions not supported by the text.

Work methodically: first compare the documents topic by topic (who the parties and \
owners are, what property and area is described, what use is permitted and what \
covenants or restrictions apply, the dates, term and figures, and any charges or other \
interests), checking every document against every other. Then list each conflict you \
found. Finding nothing is common and fine: an empty list is far better than a weak or \
speculative conflict. Report each distinct conflict once, with the most direct \
evidence.

For each conflict:
- title: a short neutral headline, e.g. "Landlord differs from registered proprietor";
- severity: "high" if it could defeat or fundamentally change the deal (ownership, \
authority to grant, permitted use, enforceability); "medium" if it affects value or key \
commercial terms (area, rent, dates, term); "low" for minor factual mismatches;
- summary: one or two plain sentences saying what each document says, referring to \
documents by label (D1, D2, ...), and why it matters to the client;
- sources: at least two, from at least two different documents. Each is an exact \
quote of the words that state the conflicting fact (not a heading), copied character \
for character from the document text, at most about 25 words, from a single page, with \
that page's number from the nearest preceding "--- Page N ---" marker.

Quotes are checked word for word against the documents and any that don't match are \
discarded, so keep every character as written, including quotation marks around \
defined terms (e.g. copy `"the Landlord" means` with its quotation marks, or start the \
quote after the defined term). Never paraphrase, abbreviate or join text from different \
places. If a fact is stated in more than one place, you may cite each place.\
"""

conflict_agent = Agent(
    "anthropic:claude-haiku-4-5-20251001",  # same model as the chat
    output_type=_Analysis,
    system_prompt=SYSTEM_PROMPT,
    model_settings={"temperature": 0.0, "max_tokens": 4096},
)


# --------------------------------------------------------------------------- #
# Analysis
# --------------------------------------------------------------------------- #


def documents_key(documents: Sequence[Document]) -> str:
    """Cache key for a set of documents: any upload (or removal) changes it."""
    ids = ",".join(doc.id for doc in sort_documents(documents))
    return hashlib.sha256(f"v{ANALYSIS_VERSION}:{ids}".encode()).hexdigest()


def _locate_quote(document: Document, page: int, quote: str) -> int | None:
    """The page `quote` is on: the cited one if it's there, else the nearest page that has it.

    The model sometimes quotes correctly but misreads which page marker a quote sits
    under; the quote itself is still verified word for word.
    """
    if quote_on_page(document, page, quote):
        return page
    for other in sorted(page_texts(document), key=lambda p: abs(p - page)):
        if other != page and quote_on_page(document, other, quote):
            return other
    return None


def _quote_candidates(quote: str) -> list[str]:
    """The quote as given, then without wrapping quote marks the model sometimes adds.

    Trying the raw form first keeps marks that are really part of the text, as in
    `"the Landlord" means …`.
    """
    raw = quote.strip()
    unwrapped = raw.strip("\"'“”‘’").strip()
    return [raw, unwrapped] if unwrapped != raw else [raw]


def _locate_source(document: Document, source: _ProposedSource) -> tuple[str, int] | None:
    """(quote, page) for a proposed source if its quote is really in the document."""
    for quote in _quote_candidates(source.quote):
        page = _locate_quote(document, source.page, quote)
        if page is not None:
            return quote, page
    return None


def _verify(
    proposed: _ProposedConflict, by_label: dict[str, Document]
) -> tuple[Conflict | None, int]:
    """Keep only sources whose quote is really in the document; returns (conflict, dropped).

    A conflict survives only if verified sources remain from two different documents.
    """
    sources: list[ConflictSource] = []
    seen: set[tuple[str, int, str]] = set()
    dropped = 0
    for source in proposed.sources:
        label = source.document.strip().upper()
        document = by_label.get(label)
        located = _locate_source(document, source) if document else None
        if document is None or located is None:
            dropped += 1
            logger.info(
                "Dropped unverified conflict source",
                conflict=proposed.title,
                label=label,
                page=source.page,
                quote=source.quote,
            )
            continue
        quote, page = located
        key = (document.id, page, normalize_for_match(quote))
        if key in seen:
            continue
        seen.add(key)
        sources.append(ConflictSource(document_id=document.id, label=label, page=page, quote=quote))

    if len({source.document_id for source in sources}) < 2:
        return None, dropped
    fingerprint = "|".join([proposed.title, *(f"{s.document_id}:{s.page}" for s in sources)])
    conflict = Conflict(
        id=hashlib.sha256(fingerprint.encode()).hexdigest()[:12],
        title=proposed.title.strip(),
        severity=proposed.severity,
        summary=proposed.summary.strip(),
        sources=sources,
    )
    return conflict, dropped


async def analyse_documents(documents: Sequence[Document]) -> ConflictReport:
    """Run the model over the documents and return only verified conflicts."""
    ordered = sort_documents(documents)
    labels = document_labels(ordered)
    by_label = {labels[doc.id]: doc for doc in ordered}
    prompt = (
        f"{format_documents(ordered)}\n\n"
        "List the genuine inconsistencies between these documents."
    )

    started = time.perf_counter()
    try:
        result = await conflict_agent.run(prompt)
    except Exception as e:
        logger.exception("Conflict check failed", documents=len(ordered))
        raise ConflictCheckError(
            "Couldn't check the documents for conflicts. Please try again in a moment."
        ) from e

    conflicts: list[Conflict] = []
    dropped_sources = 0
    for proposed in result.output.conflicts:
        conflict, dropped = _verify(proposed, by_label)
        dropped_sources += dropped
        if conflict is not None:
            conflicts.append(conflict)

    usage = result.usage
    logger.info(
        "Conflict check complete",
        documents=len(ordered),
        proposed=len(result.output.conflicts),
        kept=len(conflicts),
        dropped_sources=dropped_sources,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        seconds=round(time.perf_counter() - started, 1),
    )
    return ConflictReport(status="ready", conflicts=conflicts)


# --------------------------------------------------------------------------- #
# Caching
# --------------------------------------------------------------------------- #

# Analyses currently running, by documents key, so concurrent requests for the
# same set share one model call. Per process: with several workers each could
# run its own, and the insert below simply keeps the first result.
_in_flight: dict[str, asyncio.Task[ConflictReport]] = {}


async def _analyse_and_store(
    conversation_id: str, key: str, documents: Sequence[Document]
) -> ConflictReport:
    report = await analyse_documents(documents)
    try:
        async with async_session() as session:
            await session.execute(
                insert(ConflictCheck)
                .values(
                    documents_key=key,
                    conversation_id=conversation_id,
                    report=report.model_dump(mode="json"),
                )
                .on_conflict_do_nothing(index_elements=["documents_key"])
            )
            await session.commit()
    except IntegrityError:
        # The conversation was deleted while the analysis ran; nothing to cache.
        logger.info("Conversation gone before conflict report was stored", key=key)
    return report


async def get_conflict_report(
    session: AsyncSession, conversation: Conversation
) -> ConflictReport:
    """The conversation's conflict report, from the cache or computed now.

    Raises ConflictCheckError if the analysis fails; failures aren't cached, so
    the next request tries again.
    """
    documents = sort_documents(conversation.documents)
    if sum(1 for doc in documents if doc.extracted_text) < 2:
        return ConflictReport(status="not_applicable", conflicts=[])

    key = documents_key(documents)
    cached = await session.scalar(
        select(ConflictCheck.report).where(ConflictCheck.documents_key == key)
    )
    if cached is not None:
        return ConflictReport.model_validate(cached)

    # Don't hold a pooled connection open for the length of a model call; the
    # documents are fully loaded and stay usable once detached.
    await session.close()

    task = _in_flight.get(key)
    if task is None:
        task = asyncio.create_task(_analyse_and_store(conversation.id, key, documents))
        _in_flight[key] = task

        def forget(done: asyncio.Task[ConflictReport]) -> None:
            _in_flight.pop(key, None)
            if not done.cancelled():
                done.exception()  # waiters re-raise it; this just marks it retrieved

        task.add_done_callback(forget)

    # Shielded: if this client goes away, the analysis still finishes and is cached
    # for the others waiting on it and for the next request.
    return await asyncio.shield(task)
