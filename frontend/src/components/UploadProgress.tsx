import { AlertCircle, FileText, Loader2, X } from "lucide-react";
import type { PendingUpload } from "../hooks/use-documents";

interface UploadProgressProps {
	uploads: PendingUpload[];
	onDismiss: (key: string) => void;
}

// One row per file still on its way in, or rejected. Files that upload
// successfully leave this list and appear in the Deal documents panel.
export function UploadProgress({ uploads, onDismiss }: UploadProgressProps) {
	if (uploads.length === 0) return null;

	return (
		<ul aria-live="polite" className="mb-2 space-y-1">
			{uploads.map((upload) =>
				upload.status === "error" ? (
					<li
						key={upload.key}
						role="alert"
						className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs"
					>
						<AlertCircle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-red-500" />
						<div className="min-w-0 flex-1">
							<p
								className="truncate font-medium text-red-700"
								title={upload.filename}
							>
								{upload.filename}
							</p>
							<p className="mt-0.5 text-red-600">{upload.error}</p>
						</div>
						<button
							type="button"
							aria-label={`Dismiss error for ${upload.filename}`}
							className="flex-shrink-0 rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-300"
							onClick={() => onDismiss(upload.key)}
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</li>
				) : (
					<li
						key={upload.key}
						className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs"
					>
						{upload.status === "uploading" ? (
							<Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-neutral-400" />
						) : (
							<FileText className="h-3.5 w-3.5 flex-shrink-0 text-neutral-300" />
						)}
						<span
							className="min-w-0 flex-1 truncate text-neutral-700"
							title={upload.filename}
						>
							{upload.filename}
						</span>
						<span className="flex-shrink-0 text-neutral-400">
							{upload.status === "uploading" ? "Uploading…" : "Waiting"}
						</span>
					</li>
				),
			)}
		</ul>
	);
}
