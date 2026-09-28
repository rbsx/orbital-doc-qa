import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../lib/api";
import type { Message } from "../types";

export function useMessages(conversationId: string | null) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// In-progress replies keyed by conversation. Switching chats mid-reply lets
	// the reply finish (and be saved) in the background instead of leaking into
	// whichever chat is now on screen.
	const [streams, setStreams] = useState<Record<string, string>>({});
	const activeIdRef = useRef(conversationId);
	activeIdRef.current = conversationId;
	const controllersRef = useRef(new Set<AbortController>());

	const refresh = useCallback(async () => {
		if (!conversationId) {
			setMessages([]);
			return;
		}
		const isActive = () => activeIdRef.current === conversationId;
		try {
			setLoading(true);
			setError(null);
			const data = await api.fetchMessages(conversationId);
			if (isActive()) setMessages(data);
		} catch (err) {
			if (isActive()) {
				setError(
					err instanceof Error ? err.message : "Failed to load messages",
				);
			}
		} finally {
			if (isActive()) setLoading(false);
		}
	}, [conversationId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useEffect(() => {
		const controllers = controllersRef.current;
		return () => {
			for (const controller of controllers) controller.abort();
		};
	}, []);

	const send = useCallback(
		async (content: string) => {
			if (!conversationId || conversationId in streams) return;
			const isActive = () => activeIdRef.current === conversationId;
			const setStreamingContent = (text: string) =>
				setStreams((prev) => ({ ...prev, [conversationId]: text }));

			const userMessage: Message = {
				id: `temp-${Date.now()}`,
				conversation_id: conversationId,
				role: "user",
				content,
				sources_cited: 0,
				citations: [],
				created_at: new Date().toISOString(),
			};

			setMessages((prev) => [...prev, userMessage]);
			setStreamingContent("");
			setError(null);

			const controller = new AbortController();
			controllersRef.current.add(controller);

			try {
				const response = await api.sendMessage(
					conversationId,
					content,
					controller.signal,
				);

				if (!response.body) {
					throw new Error("No response body");
				}

				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let accumulated = "";
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					// Keep the last potentially incomplete line in the buffer
					buffer = lines.pop() ?? "";

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed || !trimmed.startsWith("data: ")) continue;

						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						try {
							const parsed = JSON.parse(data) as {
								type?: string;
								content?: string;
								delta?: string;
								message?: Message;
							};

							if (parsed.type === "delta" && parsed.delta) {
								accumulated += parsed.delta;
								setStreamingContent(accumulated);
							} else if (parsed.type === "content" && parsed.content) {
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							} else if (parsed.type === "message" && parsed.message) {
								// Final message from server
								const message = parsed.message;
								if (isActive()) setMessages((prev) => [...prev, message]);
								accumulated = "";
							} else if (parsed.content && !parsed.type) {
								// Fallback: plain content field
								accumulated += parsed.content;
								setStreamingContent(accumulated);
							}
						} catch {
							// Skip invalid JSON lines
						}
					}
				}

				// If we accumulated content but never got a final message,
				// create a synthetic assistant message
				if (accumulated && isActive()) {
					const assistantMessage: Message = {
						id: `stream-${Date.now()}`,
						conversation_id: conversationId,
						role: "assistant",
						content: accumulated,
						sources_cited: 0,
						citations: [],
						created_at: new Date().toISOString(),
					};
					setMessages((prev) => [...prev, assistantMessage]);
				}

				// Refresh to get server-canonical messages
				const freshMessages = await api.fetchMessages(conversationId);
				if (isActive()) setMessages(freshMessages);
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") return;
				if (isActive()) {
					setError(
						err instanceof Error ? err.message : "Failed to send message",
					);
				}
			} finally {
				controllersRef.current.delete(controller);
				setStreams(({ [conversationId]: _done, ...rest }) => rest);
			}
		},
		[conversationId, streams],
	);

	const streamingContent =
		conversationId !== null ? streams[conversationId] : undefined;

	return {
		messages,
		loading,
		error,
		streaming: streamingContent !== undefined,
		streamingContent: streamingContent ?? "",
		send,
		refresh,
	};
}
