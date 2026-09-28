export interface Conversation {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	has_document: boolean;
}

export interface Message {
	id: string;
	conversation_id: string;
	role: "user" | "assistant" | "system";
	content: string;
	sources_cited: number;
	citations: Citation[];
	created_at: string;
}

// docs/CONTRACT.md §3: a citation from an answer, checked against its source page.
export interface Citation {
	document_id: string | null; // null when the label matches no document
	label: string;
	page: number;
	quote: string;
	verified: boolean;
}

// docs/CONTRACT.md §4: what the document viewer should show.
export interface ViewerTarget {
	documentId: string;
	page: number; // 1-based
	quote?: string; // text to highlight on that page
}

export interface Document {
	id: string;
	conversation_id: string;
	filename: string;
	page_count: number;
	has_text: boolean;
	uploaded_at: string;
}

export interface ConversationDetail extends Conversation {
	document?: Document;
}
