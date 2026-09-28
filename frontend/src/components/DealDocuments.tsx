import { AlertTriangle, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { Document } from "../types";

interface DealDocumentsProps {
	documents: Document[];
	activeId: string | null;
	onOpen: (documentId: string) => void;
}

// The conversation's documents, above the PDF. Collapsible and capped in
// height so the PDF keeps most of the panel however many documents a deal has.
export function DealDocuments({
	documents,
	activeId,
	onOpen,
}: DealDocumentsProps) {
	const [expanded, setExpanded] = useState(true);
	const listId = useId();

	return (
		<div className="border-b border-neutral-200 bg-neutral-50">
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={listId}
				className="flex w-full items-center gap-1.5 px-4 py-2 text-left hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-neutral-400"
				onClick={() => setExpanded((e) => !e)}
			>
				<ChevronRight
					className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
						expanded ? "rotate-90" : ""
					}`}
				/>
				<span className="text-xs font-medium text-neutral-600">
					Deal documents
				</span>
				<span className="text-xs text-neutral-400">{documents.length}</span>
			</button>

			{expanded && (
				<ul
					id={listId}
					className="max-h-44 space-y-px overflow-y-auto px-2 pb-2"
				>
					{documents.map((doc) => {
						const active = doc.id === activeId;
						return (
							<li key={doc.id}>
								<button
									type="button"
									aria-current={active ? "true" : undefined}
									title={doc.filename}
									className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 ${
										active
											? "bg-white shadow-sm ring-1 ring-neutral-200"
											: "hover:bg-neutral-100"
									}`}
									onClick={() => onOpen(doc.id)}
								>
									<span
										className={`flex-shrink-0 rounded px-1.5 py-px font-mono text-[10px] font-medium ${
											active
												? "bg-neutral-800 text-white"
												: "bg-neutral-200 text-neutral-600"
										}`}
									>
										{doc.label}
									</span>
									<span
										className={`min-w-0 flex-1 truncate ${
											active
												? "font-medium text-neutral-900"
												: "text-neutral-600"
										}`}
									>
										{doc.filename}
									</span>
									{!doc.has_text && (
										<span
											className="flex-shrink-0 text-amber-500"
											title="No selectable text: the assistant can't read this one"
										>
											<AlertTriangle className="h-3.5 w-3.5" aria-hidden />
											<span className="sr-only">(no selectable text)</span>
										</span>
									)}
									<span className="flex-shrink-0 tabular-nums text-neutral-400">
										{doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
