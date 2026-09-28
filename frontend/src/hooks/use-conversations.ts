import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import type { Conversation } from "../types";

// The conversation to reopen after a reload. Browser storage can be missing or
// throw (private windows, blocked storage), in which case we just start fresh.
const LAST_CONVERSATION_KEY = "orbital:lastConversationId";

function readLastConversationId(): string | null {
	try {
		return localStorage.getItem(LAST_CONVERSATION_KEY);
	} catch {
		return null;
	}
}

function rememberConversationId(id: string | null) {
	try {
		if (id) localStorage.setItem(LAST_CONVERSATION_KEY, id);
		else localStorage.removeItem(LAST_CONVERSATION_KEY);
	} catch {
		// Not being able to remember it only costs the next reload a click.
	}
}

// No selection means a new, not-yet-created chat: the upload screen. The
// conversation is only created once something is uploaded or asked, so
// "New chat" never leaves empty conversations behind.
export function useConversations() {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [restored, setRestored] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setError(null);
			const data = await api.fetchConversations();
			setConversations(data);
			return data;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load conversations",
			);
		} finally {
			setLoading(false);
		}
		return null;
	}, []);

	// On first load, reopen the last conversation, else the most recent one,
	// else stay on the upload screen.
	useEffect(() => {
		refresh().then((data) => {
			const last = readLastConversationId();
			const reopen = data?.find((c) => c.id === last) ?? data?.[0];
			setSelectedId(reopen?.id ?? null);
			setRestored(true);
		});
	}, [refresh]);

	// Only after the first restore, so the empty initial selection can't
	// overwrite what we're about to reopen.
	useEffect(() => {
		if (restored) rememberConversationId(selectedId);
	}, [selectedId, restored]);

	const create = useCallback(async () => {
		try {
			setError(null);
			const conversation = await api.createConversation();
			setConversations((prev) => [conversation, ...prev]);
			setSelectedId(conversation.id);
			return conversation;
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create conversation",
			);
			return null;
		}
	}, []);

	const select = useCallback((id: string | null) => {
		setSelectedId(id);
	}, []);

	const remove = useCallback(
		async (id: string) => {
			try {
				setError(null);
				await api.deleteConversation(id);
				const remaining = conversations.filter((c) => c.id !== id);
				setConversations(remaining);
				// Deleting the open chat moves to the next most recent one.
				if (selectedId === id) {
					setSelectedId(remaining[0]?.id ?? null);
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to delete conversation",
				);
			}
		},
		[conversations, selectedId],
	);

	const selected = conversations.find((c) => c.id === selectedId) ?? null;

	return {
		conversations,
		selected,
		selectedId,
		loading,
		error,
		create,
		select,
		remove,
		refresh,
	};
}
