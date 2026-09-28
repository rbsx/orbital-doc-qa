// Locate a quote in a PDF page's text layer so the viewer can highlight it.
//
// pdf.js splits a page into text items whose spacing doesn't reliably match the
// text the backend extracted, so matching ignores whitespace entirely (and case,
// and curly-vs-straight punctuation, like the backend's verification does).

const FOLDS: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"“": "'",
	"”": "'",
	'"': "'",
	"–": "-",
	"—": "-",
};

function fold(char: string): string {
	return (FOLDS[char] ?? char).toLowerCase();
}

/**
 * The span to highlight in each text item, keyed by item index: [start, end).
 * The match is contiguous apart from skipped whitespace, so each item has at most
 * one span, which may include spaces between matched words.
 */
export type HighlightRanges = Map<number, [start: number, end: number]>;

/**
 * Table quotes arrive as several cells, "10,105", "938.8"; when the whole quote
 * isn't on the page, highlight each cell instead.
 */
export function findQuoteInItems(
	items: readonly string[],
	quote: string,
): HighlightRanges {
	const whole = findContiguous(items, quote);
	if (whole.size > 0) return whole;
	const ranges: HighlightRanges = new Map();
	for (const fragment of quote.split(/"\s*,\s*"/)) {
		for (const [item, [start, end]] of findContiguous(items, fragment)) {
			const span = ranges.get(item);
			ranges.set(
				item,
				span
					? [Math.min(span[0], start), Math.max(span[1], end)]
					: [start, end],
			);
		}
	}
	return ranges;
}

function findContiguous(
	items: readonly string[],
	quote: string,
): HighlightRanges {
	const ranges: HighlightRanges = new Map();
	const needle = Array.from(quote)
		.filter((c) => !/\s/.test(c))
		.map(fold)
		.join("");
	if (!needle) return ranges;

	// Flatten the page into non-whitespace characters, remembering where each came from.
	let haystack = "";
	const origin: Array<[item: number, char: number]> = [];
	items.forEach((str, item) => {
		for (let char = 0; char < str.length; char++) {
			const c = str.charAt(char);
			if (/\s/.test(c)) continue;
			haystack += fold(c);
			origin.push([item, char]);
		}
	});

	const at = haystack.indexOf(needle);
	if (at === -1) return ranges;

	for (const [item, char] of origin.slice(at, at + needle.length)) {
		const span = ranges.get(item);
		ranges.set(item, [span ? span[0] : char, char + 1]);
	}
	return ranges;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Render one text item as HTML, wrapping its highlighted span (if any) in <mark>. */
export function renderHighlightedItem(
	str: string,
	span: [start: number, end: number] | undefined,
): string {
	if (!span) return escapeHtml(str);
	const [start, end] = span;
	return `${escapeHtml(str.slice(0, start))}<mark class="citation-highlight">${escapeHtml(
		str.slice(start, end),
	)}</mark>${escapeHtml(str.slice(end))}`;
}
