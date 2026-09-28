import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { ConflictReport } from "../types";

/**
 * The conflict report for a conversation, refetched whenever the conversation or
 * its set of documents changes. `documentsKey` is any string that changes with
 * the set (e.g. the document ids joined); empty means no documents, so no fetch.
 */
export function useConflicts(
	conversationId: string | null,
	documentsKey: string,
) {
	const [report, setReport] = useState<ConflictReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: attempt is an intentional trigger for retry
	useEffect(() => {
		setReport(null);
		setError(null);
		if (!conversationId || !documentsKey) {
			setLoading(false);
			return;
		}

		// Aborting on cleanup drops responses for a conversation or document set
		// the user has already moved away from. The backend keeps computing and
		// caches the result, so coming back is instant.
		const controller = new AbortController();
		setLoading(true);
		api
			.fetchConflicts(conversationId, controller.signal)
			.then((result) => {
				if (!controller.signal.aborted) setReport(result);
			})
			.catch((err) => {
				if (controller.signal.aborted) return;
				setError(
					err instanceof Error ? err.message : "Failed to check for conflicts",
				);
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false);
			});
		return () => controller.abort();
	}, [conversationId, documentsKey, attempt]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);

	return { report, loading, error, retry };
}
