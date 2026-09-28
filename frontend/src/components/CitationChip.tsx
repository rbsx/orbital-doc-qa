import { AlertTriangle } from "lucide-react";
import { shortDocumentName } from "../lib/documents";
import { cn } from "../lib/utils";
import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationChipProps {
	label: string;
	// The cited document's filename, when the label matches one.
	filename?: string;
	page: number;
	quote: string;
	// Absent while the answer is still streaming: not yet checked.
	citation?: Citation;
	onOpen?: () => void;
}

export function CitationChip({
	label,
	filename,
	page,
	quote,
	citation,
	onOpen,
}: CitationChipProps) {
	const name = filename ? shortDocumentName(filename) : label;
	const source = `${filename ?? label}, page ${page}`;
	const pending = citation === undefined;
	const unverified = citation !== undefined && !citation.verified;
	const canOpen = !!onOpen && !!citation?.document_id;

	const status = pending
		? "Checking source…"
		: unverified
			? "Quote not found on this page. Check before relying on it."
			: "Verified against the document";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					// aria-disabled rather than disabled, so the tooltip still explains
					// a chip that can't be opened.
					aria-disabled={!canOpen}
					onClick={canOpen ? onOpen : undefined}
					aria-label={`${source}: “${quote}”. ${status}${canOpen ? ". Open in viewer" : ""}`}
					className={cn(
						"mx-0.5 inline-flex max-w-[16rem] translate-y-[-1px] items-center gap-1 whitespace-nowrap rounded border px-1.5 align-middle text-[11px] font-medium leading-[18px] transition-colors",
						"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 aria-disabled:cursor-default",
						pending && "border-neutral-200 bg-white text-neutral-400",
						unverified &&
							"border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
						!pending &&
							!unverified &&
							"border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900",
					)}
				>
					{unverified && <AlertTriangle className="h-2.5 w-2.5" />}
					{name} · p.{page}
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs border border-neutral-200 bg-white px-3 py-2 shadow-md">
				<p className="mb-1 truncate text-[11px] font-medium text-neutral-500">
					{source}
				</p>
				<p className="font-serif text-[13px] leading-snug text-neutral-800">
					“{quote}”
				</p>
				<p
					className={cn(
						"mt-1.5 text-[11px]",
						unverified ? "text-amber-700" : "text-neutral-500",
					)}
				>
					{status}
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
