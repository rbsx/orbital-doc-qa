import type {
	ConflictReport,
	Conversation,
	ConversationDetail,
	Document,
	Message,
} from "../types";

const BASE = "/api";

// FastAPI puts user-facing messages in `detail`; show that rather than raw JSON.
async function responseError(response: Response): Promise<Error> {
	const text = await response.text().catch(() => "");
	try {
		const { detail } = JSON.parse(text) as { detail?: unknown };
		if (typeof detail === "string") return new Error(detail);
	} catch {
		// Not JSON: fall back to the raw body
	}
	return new Error(`API error ${response.status}: ${text || "Unknown error"}`);
}

async function handleResponse<T>(response: Response): Promise<T> {
	if (!response.ok) throw await responseError(response);
	return response.json() as Promise<T>;
}

export async function fetchConversations(): Promise<Conversation[]> {
	const res = await fetch(`${BASE}/conversations`);
	return handleResponse<Conversation[]>(res);
}

export async function createConversation(): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ title: "New conversation" }),
	});
	return handleResponse<Conversation>(res);
}

export async function deleteConversation(id: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${id}`, {
		method: "DELETE",
	});
	if (!res.ok) throw await responseError(res);
}

export async function fetchConversation(
	id: string,
): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`);
	return handleResponse<ConversationDetail>(res);
}

export async function fetchMessages(
	conversationId: string,
): Promise<Message[]> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`);
	return handleResponse<Message[]>(res);
}

export async function sendMessage(
	conversationId: string,
	content: string,
	signal?: AbortSignal,
): Promise<Response> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
		signal,
	});
	if (!res.ok) throw await responseError(res);
	return res;
}

export async function uploadDocument(
	conversationId: string,
	file: File,
): Promise<Document> {
	const formData = new FormData();
	formData.append("file", file);
	const res = await fetch(`${BASE}/conversations/${conversationId}/documents`, {
		method: "POST",
		body: formData,
	});
	return handleResponse<Document>(res);
}

// Slow on first call for a set of documents (the backend runs the analysis),
// instant afterwards.
export async function fetchConflicts(
	conversationId: string,
	signal?: AbortSignal,
): Promise<ConflictReport> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/conflicts`, {
		signal,
	});
	return handleResponse<ConflictReport>(res);
}

export function getDocumentUrl(documentId: string): string {
	return `${BASE}/documents/${documentId}/content`;
}
