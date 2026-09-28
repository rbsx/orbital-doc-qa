import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { Document } from "../types";

// A file the user picked that isn't a document yet: waiting its turn,
// uploading, or rejected (with the server's reason).
export interface PendingUpload {
	key: string;
	conversationId: string;
	filename: string;
	status: "queued" | "uploading" | "error";
	error?: string;
	// Rejected because it needs a password to open, not because it's broken.
	locked?: boolean;
}

export function useDocuments(conversationId: string | null) {
	const [documents, setDocuments] = useState<Document[]>([]);
	const [pending, setPending] = useState<PendingUpload[]>([]);
	const [error, setError] = useState<string | null>(null);
	const activeIdRef = useRef(conversationId);
	activeIdRef.current = conversationId;
	// Files upload one at a time, even across batches, so labels follow the
	// order they were picked in and each one is checked against the
	// conversation's text budget with the earlier ones already counted.
	const queueRef = useRef<Promise<void>>(Promise.resolve());
	const nextKeyRef = useRef(0);

	// Never show the previous conversation's documents while this one loads.
	const [shownConversationId, setShownConversationId] =
		useState(conversationId);
	if (conversationId !== shownConversationId) {
		setShownConversationId(conversationId);
		setDocuments([]);
		setError(null);
	}

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setDocuments([]);
			return;
		}
		const isActive = () => activeIdRef.current === conversationId;
		try {
			setError(null);
			const detail = await api.fetchConversation(conversationId);
			if (isActive()) setDocuments(detail.documents);
		} catch (err) {
			if (isActive()) {
				setError(
					err instanceof Error ? err.message : "Failed to load documents",
				);
			}
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	/**
	 * Upload files as separate requests so each gets its own progress and error.
	 * `onUploaded` runs for each document that arrives while its conversation is
	 * still the one on screen. Resolves when every file has finished.
	 */
	const upload = useCallback(
		(files: File[], onUploaded?: (document: Document) => void) => {
			if (!conversationId || files.length === 0) return queueRef.current;
			const isActive = () => activeIdRef.current === conversationId;
			const batch = files.map((file) => ({
				file,
				key: `upload-${nextKeyRef.current++}`,
			}));
			const update = (key: string, patch: Partial<PendingUpload>) =>
				setPending((prev) =>
					prev.map((p) => (p.key === key ? { ...p, ...patch } : p)),
				);

			setPending((prev) => [
				// Starting a new batch clears this conversation's old failures.
				...prev.filter(
					(p) => p.status !== "error" || p.conversationId !== conversationId,
				),
				...batch.map(({ file, key }) => ({
					key,
					conversationId,
					filename: file.name,
					status: "queued" as const,
				})),
			]);

			const run = async () => {
				for (const { file, key } of batch) {
					update(key, { status: "uploading" });
					try {
						const document = await api.uploadDocument(conversationId, file);
						setPending((prev) => prev.filter((p) => p.key !== key));
						if (isActive()) {
							setDocuments((prev) => [
								...prev.filter((d) => d.id !== document.id),
								document,
							]);
							onUploaded?.(document);
						}
					} catch (err) {
						update(key, {
							status: "error",
							error:
								err instanceof Error
									? err.message
									: "Failed to upload document",
							locked:
								err instanceof api.ApiError &&
								err.code === "password_protected",
						});
					}
				}
			};
			queueRef.current = queueRef.current.then(run);
			return queueRef.current;
		},
		[conversationId],
	);

	const dismiss = useCallback((key: string) => {
		setPending((prev) => prev.filter((p) => p.key !== key));
	}, []);

	const uploads = pending.filter((p) => p.conversationId === conversationId);

	return {
		documents,
		uploads,
		uploading: uploads.some((p) => p.status !== "error"),
		error,
		upload,
		dismiss,
		refresh,
	};
}
