// Inline citations look like [[D2 p4: "exact quote"]] (docs/CONTRACT.md §3).
// Keep this pattern in step with CITATION_PATTERN in services/citations.py: the
// backend returns citations in the same order, and chips are matched by index.
const CITATION = /\[\[\s*(D\d+)\s+p\.?\s*(\d+)\s*:\s*"([\s\S]+?)"\s*\]\]/g;

// While streaming, a marker can arrive half-written; hide it until it closes.
const OPEN_MARKER = /\[\[[^\]]*$/;

export const CITATION_HREF_PREFIX = "#cite-";

export interface CitationMarker {
	label: string;
	page: number;
	quote: string;
}

/**
 * Replace citation markers with markdown links (`[D1 · p.4](#cite-0)`) that the
 * message renderer turns into chips, and return the markers in order.
 */
export function prepareCitations(content: string): {
	markdown: string;
	markers: CitationMarker[];
} {
	const markers: CitationMarker[] = [];
	const markdown = content
		.replace(CITATION, (_match, label: string, page: string, quote: string) => {
			const index =
				markers.push({ label, page: Number(page), quote: quote.trim() }) - 1;
			return ` [${label} · p.${page}](${CITATION_HREF_PREFIX}${index})`;
		})
		.replace(OPEN_MARKER, "");
	return { markdown, markers };
}
