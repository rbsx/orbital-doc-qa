import {
	AlertTriangle,
	ChevronDown,
	Loader2,
	MessageSquareText,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "../lib/utils";
import type {
	Conflict,
	ConflictReport,
	Document,
	ViewerTarget,
} from "../types";
import { CitationChip } from "./CitationChip";

// Don't flash the checking state for cached or not-applicable reports, which
// come back almost immediately.
const CHECKING_DELAY_MS = 400;

const SEVERITY: Record<
	Conflict["severity"],
	{ label: string; className: string }
> = {
	high: {
		label: "High",
		className: "border-amber-300 bg-amber-100 text-amber-900",
	},
	medium: {
		label: "Medium",
		className: "border-amber-200 bg-amber-50 text-amber-800",
	},
	low: {
		label: "Low",
		className: "border-neutral-200 bg-neutral-50 text-neutral-600",
	},
};

interface ConflictBannerProps {
	report: ConflictReport | null;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onAsk: (question: string) => void;
	askDisabled?: boolean;
	onOpenSource?: (target: ViewerTarget) => void;
	documents: Document[];
}

export function ConflictBanner({
	documents,
	report,
	loading,
	error,
	onRetry,
	onAsk,
	askDisabled,
	onOpenSource,
}: ConflictBannerProps) {
	const [expanded, setExpanded] = useState(false);
	const [showChecking, setShowChecking] = useState(false);
	const listId = useId();

	useEffect(() => {
		if (!loading) {
			setShowChecking(false);
			return;
		}
		const timer = setTimeout(() => setShowChecking(true), CHECKING_DELAY_MS);
		return () => clearTimeout(timer);
	}, [loading]);

	if (loading) {
		if (!showChecking) return null;
		return (
			<output className="mx-4 mt-2 flex items-center gap-2 px-1 text-xs text-neutral-500">
				<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
				Checking documents for conflicts…
			</output>
		);
	}

	if (error) {
		return (
			<div className="mx-4 mt-2 flex items-center gap-2 px-1 text-xs text-neutral-500">
				<span role="alert">{error}</span>
				<button
					type="button"
					onClick={onRetry}
					className="rounded font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
				>
					Retry
				</button>
			</div>
		);
	}

	const conflicts = report?.status === "ready" ? report.conflicts : [];
	if (conflicts.length === 0) return null;

	const count = conflicts.length;
	const filenames = new Map(documents.map((d) => [d.id, d.filename]));
	return (
		<section
			aria-label="Possible conflicts between documents"
			className="mx-4 mt-2 rounded-lg border border-amber-200 bg-amber-50/50"
		>
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={listId}
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
			>
				<AlertTriangle
					className="h-4 w-4 flex-shrink-0 text-amber-600"
					aria-hidden="true"
				/>
				<span className="flex-1 font-medium">
					{count} possible conflict{count !== 1 ? "s" : ""} across documents
				</span>
				<span className="text-xs text-amber-700">
					{expanded ? "Hide" : "Review"}
				</span>
				<ChevronDown
					className={cn(
						"h-4 w-4 text-amber-700 transition-transform",
						expanded && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>

			{expanded && (
				<ul
					id={listId}
					className="max-h-[45vh] divide-y divide-amber-100 overflow-y-auto border-t border-amber-200"
				>
					{conflicts.map((conflict) => (
						<ConflictItem
							key={conflict.id}
							conflict={conflict}
							onAsk={onAsk}
							askDisabled={askDisabled}
							onOpenSource={onOpenSource}
							filenames={filenames}
						/>
					))}
				</ul>
			)}
		</section>
	);
}

function ConflictItem({
	conflict,
	onAsk,
	askDisabled,
	onOpenSource,
	filenames,
}: {
	conflict: Conflict;
	onAsk: (question: string) => void;
	askDisabled?: boolean;
	onOpenSource?: (target: ViewerTarget) => void;
	filenames: Map<string, string>;
}) {
	const severity = SEVERITY[conflict.severity];
	return (
		<li className="bg-white/70 px-3 py-3">
			<div className="flex items-start gap-2">
				<span
					className={cn(
						"mt-0.5 flex-shrink-0 rounded border px-1.5 py-px text-[11px] font-medium",
						severity.className,
					)}
				>
					<span className="sr-only">Severity: </span>
					{severity.label}
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-medium text-neutral-800">
						{conflict.title}
					</h3>
					<p className="mt-0.5 text-sm leading-relaxed text-neutral-600">
						{conflict.summary}
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<span className="sr-only">Sources:</span>
						{conflict.sources.map((source) => (
							// Sources are verified on the server before a conflict is shown.
							<CitationChip
								key={`${source.document_id}-${source.page}-${source.quote}`}
								label={source.label}
								filename={filenames.get(source.document_id)}
								page={source.page}
								quote={source.quote}
								citation={{ ...source, verified: true }}
								onOpen={
									onOpenSource
										? () =>
												onOpenSource({
													documentId: source.document_id,
													page: source.page,
													quote: source.quote,
												})
										: undefined
								}
							/>
						))}
						<button
							type="button"
							disabled={askDisabled}
							onClick={() => onAsk(explainQuestion(conflict, filenames))}
							className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50"
						>
							<MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
							Ask to explain
						</button>
					</div>
				</div>
			</div>
		</li>
	);
}

// Sent as the user's message, so it names the files rather than D1/D2 labels.
function explainQuestion(
	conflict: Conflict,
	filenames: Map<string, string>,
): string {
	const labels = [
		...new Set(
			conflict.sources.map((s) => filenames.get(s.document_id) ?? s.label),
		),
	];
	const between =
		labels.length > 1
			? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
			: labels[0];
	return `Explain the conflict '${conflict.title}' between ${between}: what each document says, why it matters for the client, and what to check next.`;
}
