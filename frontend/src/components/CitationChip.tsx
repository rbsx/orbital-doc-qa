import { AlertTriangle } from "lucide-react";
import { cn } from "../lib/utils";
import type { Citation } from "../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface CitationChipProps {
	label: string;
	page: number;
	quote: string;
	// Absent while the answer is still streaming: not yet checked.
	citation?: Citation;
	onOpen?: () => void;
}

export function CitationChip({
	label,
	page,
	quote,
	citation,
	onOpen,
}: CitationChipProps) {
	const pending = citation === undefined;
	const unverified = citation !== undefined && !citation.verified;
	const canOpen = !!onOpen && !!citation?.document_id;

	const status = pending
		? "Checking source…"
		: unverified
			? "Quote not found on this page. Check before relying on it."
			: `Verified in ${label}, page ${page}`;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					// aria-disabled rather than disabled, so the tooltip still explains
					// a chip that can't be opened.
					aria-disabled={!canOpen}
					onClick={canOpen ? onOpen : undefined}
					aria-label={`${status}. Source ${label} page ${page}: “${quote}”${canOpen ? ". Open in viewer" : ""}`}
					className={cn(
						"mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded border px-1.5 align-middle font-mono text-[10.5px] font-medium leading-[18px] transition-colors",
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
					{label} · p.{page}
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-xs border border-neutral-200 bg-white px-3 py-2 shadow-md">
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
