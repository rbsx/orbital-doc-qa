import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import { findQuoteInItems, renderHighlightedItem } from "../lib/highlight";
import type { Document, ViewerTarget } from "../types";
import { Button } from "./ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;

interface DocumentViewerProps {
	document: Document | null;
	// A citation (or other source) to jump to and highlight.
	target?: ViewerTarget | null;
}

export function DocumentViewer({ document, target }: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Start each document fresh: otherwise switching from page 7 of one
	// document to a 3-page one requests a page that doesn't exist.
	const [shownDocumentId, setShownDocumentId] = useState(document?.id);
	if (document?.id !== shownDocumentId) {
		setShownDocumentId(document?.id);
		setCurrentPage(1);
		setNumPages(0);
		setPdfLoading(true);
		setPdfError(null);
	}

	// Text items of the page on screen, used to find the quote in the text layer.
	// Cleared on every page change so a stale page's text is never highlighted.
	const [pageItems, setPageItems] = useState<string[]>([]);

	// Jump to a new target on this document, remembering which quote to highlight.
	const [appliedTarget, setAppliedTarget] = useState(target);
	const [highlight, setHighlight] = useState<{
		page: number;
		quote: string;
	} | null>(null);
	if (target !== appliedTarget) {
		setAppliedTarget(target);
		if (target && target.documentId === document?.id) {
			setCurrentPage(target.page);
			setPageItems([]);
			setHighlight(
				target.quote ? { page: target.page, quote: target.quote } : null,
			);
		}
	}

	const activeQuote = highlight?.page === currentPage ? highlight.quote : null;
	const highlightRanges = useMemo(
		() => (activeQuote ? findQuoteInItems(pageItems, activeQuote) : null),
		[pageItems, activeQuote],
	);
	const customTextRenderer = useCallback(
		({ str, itemIndex }: { str: string; itemIndex: number }) =>
			renderHighlightedItem(str, highlightRanges?.get(itemIndex)),
		[highlightRanges],
	);

	const goToPage = (page: number) => {
		setCurrentPage(page);
		setPageItems([]);
		setHighlight(null);
	};

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			setDragging(true);

			const startX = e.clientX;
			const startWidth = width;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = startX - moveEvent.clientX;
				const newWidth = Math.min(
					MAX_WIDTH,
					Math.max(MIN_WIDTH, startWidth + delta),
				);
				setWidth(newWidth);
			};

			const handleMouseUp = () => {
				setDragging(false);
				window.removeEventListener("mousemove", handleMouseMove);
				window.removeEventListener("mouseup", handleMouseUp);
			};

			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[width],
	);

	const pdfPageWidth = width - 48; // account for px-4 padding on each side

	if (!document) {
		return (
			<div
				style={{ width }}
				className="flex h-full flex-shrink-0 flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50"
			>
				<FileText className="mb-3 h-10 w-10 text-neutral-300" />
				<p className="text-sm text-neutral-400">No document uploaded</p>
			</div>
		);
	}

	const pdfUrl = getDocumentUrl(document.id);

	return (
		<div
			ref={containerRef}
			style={{ width }}
			className="relative flex h-full flex-shrink-0 flex-col border-l border-neutral-200 bg-white"
		>
			{/* Resize handle */}
			<div
				className={`absolute top-0 left-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-neutral-300 ${
					dragging ? "bg-neutral-400" : ""
				}`}
				onMouseDown={handleMouseDown}
			/>

			{/* Header */}
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-neutral-800">
						{document.filename}
					</p>
					<p className="text-xs text-neutral-400">
						{document.page_count} page{document.page_count !== 1 ? "s" : ""}
					</p>
				</div>
			</div>

			{!document.has_text && (
				<div className="flex gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
					<AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0" />
					<p>
						No selectable text found, so this is probably a scan. The assistant
						can't read it; upload a text-based PDF to ask questions about it.
					</p>
				</div>
			)}

			{/* PDF content */}
			<div className="flex-1 overflow-y-auto p-4">
				{pdfError && (
					<div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
						{pdfError}
					</div>
				)}

				<PDFDocument
					file={pdfUrl}
					onLoadSuccess={({ numPages: pages }) => {
						setNumPages(pages);
						setPdfLoading(false);
						setPdfError(null);
					}}
					onLoadError={(error) => {
						setPdfError(`Failed to load PDF: ${error.message}`);
						setPdfLoading(false);
					}}
					loading={
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
						</div>
					}
				>
					{!pdfLoading && !pdfError && (
						<Page
							pageNumber={currentPage}
							onGetTextSuccess={({ items }) =>
								setPageItems(
									items.map((item) => ("str" in item ? item.str : "")),
								)
							}
							customTextRenderer={
								highlightRanges?.size ? customTextRenderer : undefined
							}
							onRenderTextLayerSuccess={() =>
								containerRef.current
									?.querySelector(".citation-highlight")
									?.scrollIntoView({ block: "center", behavior: "smooth" })
							}
							width={pdfPageWidth}
							loading={
								<div className="flex items-center justify-center py-12">
									<Loader2 className="h-5 w-5 animate-spin text-neutral-300" />
								</div>
							}
						/>
					)}
				</PDFDocument>
			</div>

			{/* Page navigation */}
			{numPages > 0 && (
				<div className="flex items-center justify-center gap-3 border-t border-neutral-100 px-4 py-2.5">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage <= 1}
						aria-label="Previous page"
						onClick={() => goToPage(Math.max(1, currentPage - 1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-neutral-500">
						Page {currentPage} of {numPages}
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						disabled={currentPage >= numPages}
						aria-label="Next page"
						onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
