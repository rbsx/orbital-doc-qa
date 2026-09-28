const MAX_SHORT_NAME = 24;

/**
 * A readable name for a document in tight spots like citation chips:
 * "commercial-lease-100-bishopsgate.pdf" → "Commercial lease 100…".
 * Cut at a word boundary; the full filename belongs in a tooltip.
 */
export function shortDocumentName(filename: string): string {
	const words = filename
		.replace(/\.pdf$/i, "")
		.replace(/[-_.]+/g, " ")
		.trim()
		.split(/\s+/);
	let name = "";
	for (const word of words) {
		const next = name ? `${name} ${word}` : word;
		if (next.length > MAX_SHORT_NAME) {
			name = name ? `${name}…` : `${word.slice(0, MAX_SHORT_NAME - 1)}…`;
			break;
		}
		name = next;
	}
	return name.charAt(0).toUpperCase() + name.slice(1);
}
