import {
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	FileText,
	Loader2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Document as PDFDocument, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { getDocumentUrl } from "../lib/api";
import type { Document, ViewerTarget } from "../types";
import { DealDocuments } from "./DealDocuments";
import { Button } from "./ui/button";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const MIN_WIDTH = 280;
const MAX_WIDTH = 700;
const DEFAULT_WIDTH = 400;

interface DocumentViewerProps {
	documents: Document[];
	// The document on screen and where in it: owned by App (CONTRACT §4).
	document: Document | null;
	page: number;
	quote?: string;
	onPageChange: (page: number) => void;
	onOpen: (target: ViewerTarget) => void;
}

export function DocumentViewer({
	documents,
	document,
	page,
	onPageChange,
	onOpen,
}: DocumentViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pdfLoading, setPdfLoading] = useState(true);
	const [pdfError, setPdfError] = useState<string | null>(null);
	const [width, setWidth] = useState(DEFAULT_WIDTH);
	const [dragging, setDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Start each document's loading state fresh. The width deliberately
	// carries over, so a resized panel stays that size across documents.
	const [shownDocumentId, setShownDocumentId] = useState(document?.id);
	if (document?.id !== shownDocumentId) {
		setShownDocumentId(document?.id);
		setNumPages(0);
		setPdfLoading(true);
		setPdfError(null);
	}

	// A target can name a page the PDF doesn't have (e.g. a model citing
	// page 12 of a 9-page lease); show the nearest real page instead.
	const currentPage =
		numPages > 0 ? Math.min(Math.max(1, page), numPages) : Math.max(1, page);

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
				<p className="text-sm text-neutral-400">No documents uploaded</p>
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

			<DealDocuments
				documents={documents}
				activeId={document.id}
				onOpen={(documentId) => onOpen({ documentId, page: 1 })}
			/>

			{/* Header */}
			<div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
				<div className="flex min-w-0 items-start gap-2">
					<span className="mt-0.5 flex-shrink-0 rounded bg-neutral-100 px-1.5 py-px font-mono text-[10px] font-medium text-neutral-600">
						{document.label}
					</span>
					<div className="min-w-0">
						<p
							className="truncate text-sm font-medium text-neutral-800"
							title={document.filename}
						>
							{document.filename}
						</p>
						<p className="text-xs text-neutral-400">
							{document.page_count} page{document.page_count !== 1 ? "s" : ""}
						</p>
					</div>
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
						onClick={() => onPageChange(currentPage - 1)}
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
						onClick={() => onPageChange(currentPage + 1)}
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			)}
		</div>
	);
}
