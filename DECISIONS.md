# Decisions

## What I built, why, and what's next

Commercial real estate lawyers doing due diligence need two things from an AI assistant before it's worth using: **answers they can check**, because they're professionally liable for what they tell a client, and **coverage of the whole deal**, because a transaction is a stack of documents, not one PDF. The starting app failed both. Its "N sources cited" was a regex count of words like "section 3", nothing linked back to the document, and a conversation could hold exactly one file. So I built three connected features:
- **Verifiable citations.** Every claim carries an exact quote that the server checks against the cited page. One click opens that page with the quote highlighted, and anything that doesn't check out is flagged amber.
- **Multi-document deals.** One conversation holds a deal's documents, with a file panel, and answers draw on all of them.
- **A cross-document conflict check.** It proactively flags where the documents disagree (landlord vs registered owner, permitted use vs a covenant, lease area vs survey), each conflict with verified sources on both sides.

Before any of that, I fixed the rough edges a lawyer would hit in the first ten minutes (PR #1): times off by an hour in the UK, replies leaking between chats, uploads failing silently, scans reported as "no document uploaded", and an inaccessible sidebar.

I chose these over the alternatives below because they target the two things that decide whether a lawyer can use the product at all: trust, and coverage of the whole deal. Features like exporting a memo or a key-terms summary only matter once those two hold. Citations came first because they're what every other answer, the conflict check included, relies on. Multi-document support was the explicit gap in the brief ("often dozens of documents per deal"). The conflict check shows what having all the documents in one place makes possible: the kind of mismatch that is expensive when it's missed. Throughout, I kept each piece measurable. Citation quality was tuned against a fixed set of questions: 16 of 17 quotes verified at first, then 17 of 17, then 12 of 12 once table figures were handled. The conflict check finds all three conflicts planted in the demo deal pack in 4 of 4 runs, and none in unrelated documents.

With more time, I'd do these next:
1. **Flag claims that have no citation,** not only citations that fail. The model occasionally states something without a source, and the UI can't show that yet.
2. **Retrieval for large data rooms.** Every document currently goes to the model in full, within a 400,000-character budget. That's fine for a deal pack but not for a hundred-document data room.
3. **Unlock password-protected PDFs.** Today they're detected and rejected clearly.
4. **Tests around the parts that must not regress:** quote matching, label stability, and conflict verification.

## Alternatives I considered

| Idea | Value to a lawyer | Why not (now) |
|---|---|---|
| **Verifiable citations** ✅ | Makes every answer checkable; the foundation for trust | Built |
| **Multi-document deals** ✅ | Matches how deals actually arrive | Built |
| **Cross-document conflict check** ✅ | Catches expensive mismatches proactively | Built, on top of the two above |
| Key-terms summary on upload | Saves the first ten minutes with each lease | Useful, but close to what Orbital's existing reports already cover; lower marginal value than trust and coverage |
| Export conversation as a memo | Feeds the lawyer's report | Last step of the workflow; only valuable once answers are trustworthy |
| Retrieval (chunking and embeddings) | Scales to big data rooms | Invisible in a demo-sized deal; the context budget covers the brief's scale for now |
| OCR for scans | Unlocks scanned title documents | Heavy dependency; I made scans explicit instead (warning plus an honest assistant reply) |

## Decisions and trade-offs worth knowing

- **Citations are checked when messages are read, not stored.** Checking is cheap, needs no migration, and always reflects the documents currently in the conversation. The matching ignores case, line breaks and quote-mark style, because PDF extraction breaks lines and the model re-flows them. It also verifies table quotes cell by cell (`"10,105", "938.8"`), ignores colons the model inserts between a table's label and value, and re-points a verbatim quote cited under the wrong page to the page it's actually on.
- **Chips show document names; the model uses labels.** `[[D2 p4: "…"]]` is short and unambiguous for the model; readers see "Report on title 100… · p.4".
- **Labels never shift.** Each document stores its position at upload and positions are never reused. Removing D2 leaves D1 and D3, so old citations can't silently point at a different file.
- **Highlighting maps the quote onto pdf.js's text layer, ignoring whitespace.** pdf.js splits pages into text runs that don't match the extracted text. Visually the band is extended to sit on the printed line, since the invisible text layer uses a fallback font.
- **The conflict check is one structured model call over all the documents,** with every source quote verified and anything unverifiable dropped. It takes about 13 s and about $0.016 for the three-document pack, and results are cached per set of documents. Pairwise comparison would scale better, but it isn't needed at this size.
- **Locked PDFs are rejected with a reason rather than unlocked.** That removed the misleading "probably a scan" state in minutes. Unlocking properly (a password field, decrypt, never store the password) is designed but deferred.
- **A new chat isn't saved until something is uploaded or asked,** so abandoned clicks don't clutter the sidebar. A placeholder row shows where uploads will go.
- **I kept Haiku 4.5.** It's fast and cheap, and the verification layer catches its misquotes. A stronger model would mostly buy fewer amber chips.

## How I worked with AI

I used Claude Code throughout. I set the direction and made the product calls: what to build, what to cut, what felt wrong in the UI. Claude Code implemented and verified. Three things made that work well:

- **Contract first, then parallel agents.** Multi-document support and the conflict check were built by two subagents in separate git worktrees, each with its own Docker stack on its own ports, while citations were built in the main checkout. Before starting them, I committed [`docs/CONTRACT.md`](docs/CONTRACT.md) and a small shared helper module to `main`, fixing the seams: document labels, the prompt format, the citation marker, the viewer target and the conflicts API. The merge conflicts were exactly the overlaps the contract predicted, and each resolution is its own commit.
- **Reproduce, fix, verify, one commit per fix.** Every bug was reproduced before it was fixed, and every change was checked in a real browser or against the API before merging (for example, measuring the 0.75 s title-generation stall before and after). The PR descriptions record what was checked and how.
- **Measure the model, don't trust it.** Prompt changes were judged on fixed question sets, not impressions:
  - citations verified;
  - citations that carried the sentence's content (answers like "must give the landlord [chip] of its intention");
  - conflicts found across repeated runs.

Examples where the AI's first attempt was wrong and review caught it:
- A formatter reflowed untouched code, so the commit was redone to show only the real change.
- A prompt led the model to suggest uploading a Word document, which the app rejects.
- A "stale page text" fix broke highlighting of a second citation on the same page.
- A new-chat race condition made the user's first question vanish while the answer streamed.

All four were found by testing in the browser, not by reading the diff.

## What changed, PR by PR

The full diff against the starting code: [`851ccdd...main`](https://github.com/rbsx/orbital-doc-qa/compare/851ccdd...main).

1. [#1](https://github.com/rbsx/orbital-doc-qa/pull/1) Rough edges: timestamps, streaming between chats, upload feedback, scans, sidebar ordering, title latency, accessibility
2. [#2](https://github.com/rbsx/orbital-doc-qa/pull/2) Several documents per deal, with a file panel *(subagent)*
3. [#3](https://github.com/rbsx/orbital-doc-qa/pull/3) Verifiable citations
4. [#4](https://github.com/rbsx/orbital-doc-qa/pull/4) Conflict check and the 100 Bishopsgate demo deal pack *(subagent, integrated by me)*
5. [#5](https://github.com/rbsx/orbital-doc-qa/pull/5) Locked PDFs; a new-chat flow without empty conversations; reopen the last chat on reload
6. [#6](https://github.com/rbsx/orbital-doc-qa/pull/6) Chats named after their first document, suggested questions, the all-clear notice, citation quality
7. [#7](https://github.com/rbsx/orbital-doc-qa/pull/7) Removing documents with stable labels, alignment, resilience to a failed load
8. [#8](https://github.com/rbsx/orbital-doc-qa/pull/8) Confirmation before removing a document

## Known limitations

- **Uncited claims aren't flagged,** and the model occasionally still places a citation mid-sentence.
- **Highlight edges are approximate:** a line's band can end a few characters short.
- **There are no automated tests yet.** Verification was manual and scripted against the running app, and is recorded in each PR.
- **The conflict check's in-flight de-duplication is per process.**
