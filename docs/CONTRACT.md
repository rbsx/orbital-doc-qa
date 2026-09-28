# Shared contract: multi-document, citations, conflict check

Three features are built in parallel on separate branches and integrated afterwards.
This file is the seam between them. If a branch needs to change something here,
it stops and flags it instead of improvising.

| Branch | Owner | Builds |
|---|---|---|
| `feat/multi-document` | subagent | Several PDFs per conversation, file panel, all documents in the prompt |
| `feat/verifiable-citations` | lead | Inline citations, quote verification, jump-to-quote in the viewer |
| `feat/conflict-check` | subagent | Cross-document conflict analysis, chat banner, demo deal pack |

## 1. Document labels

Each document in a conversation has a stable label, `D1`, `D2`, … assigned by upload
order (`uploaded_at`, then `id`). The backend computes it; the frontend never derives it.

```ts
interface Document {
	id: string;
	conversation_id: string;
	label: string; // "D1", "D2", …
	filename: string;
	page_count: number;
	has_text: boolean;
	uploaded_at: string;
}
```

`GET /api/conversations/{id}` returns `documents: Document[]` sorted by label
(replacing the single `document` field).

## 2. Documents in the prompt

A single function in `backend/src/takehome/services/document_context.py` renders a
conversation's documents for any LLM call (chat and conflict check):

```python
def format_documents(documents: Sequence[Document]) -> str: ...
```

```
<document label="D1" filename="commercial-lease.pdf" pages="9">
--- Page 1 ---
...
</document>
<document label="D2" filename="title-report.pdf" pages="3">
...
</document>
```

Page markers stay exactly `--- Page N ---` (1-based), as extracted today. Documents
without text are still listed, with an empty body and `has_text="false"`.

## 3. Citations

Answers cite inline with this marker, one per claim:

```
[[D2 p4: "exact quote copied from the document"]]
```

The backend returns parsed and verified citations on every assistant message:

```ts
interface Citation {
	document_id: string;
	label: string;
	page: number;
	quote: string;
	verified: boolean; // quote found on that page (whitespace/case-insensitive)
}
// Message gains: citations: Citation[]
```

## 4. Opening a source in the viewer

`App` owns what the viewer shows. Anything that points at a document (file panel,
citation chip, conflict source) calls one function:

```ts
interface ViewerTarget {
	documentId: string;
	page: number; // 1-based
	quote?: string; // text to highlight on that page
}
openSource(target: ViewerTarget): void;
```

`DocumentViewer` receives the active document plus `page` / `quote` and reports page
changes back through `onPageChange(page)`.

## 5. Conflict check API

```
GET /api/conversations/{id}/conflicts
```

```ts
interface ConflictSource {
	document_id: string;
	label: string;
	page: number;
	quote: string;
}
interface Conflict {
	id: string;
	title: string; // e.g. "Landlord differs from registered owner"
	severity: "high" | "medium" | "low";
	summary: string; // one or two sentences
	sources: ConflictSource[]; // at least two, from different documents
}
interface ConflictReport {
	status: "not_applicable" | "ready"; // not_applicable when < 2 documents with text
	conflicts: Conflict[];
}
```

The report is cached per set of documents and recomputed when the set changes.

## 6. Ground rules for every branch

- Migrations: conflict check uses `003_*`. Anything else that needs one uses `004_*` and flags it.
- Don't reformat untouched code (no whole-file `ruff format`); diffs show only real changes.
- Commits are small and single-purpose, written in the author's voice, with no AI attribution trailers.
- `just check` equivalents must not add errors beyond the baseline (ruff 3, pyright 5, frontend 0).
