export interface Conversation {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	has_document: boolean;
	document_count: number;
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

export interface Document {
	id: string;
	conversation_id: string;
	label: string; // "D1", "D2", … assigned by the backend in upload order
	filename: string;
	page_count: number;
	has_text: boolean;
	uploaded_at: string;
}

export interface ConversationDetail extends Conversation {
	documents: Document[]; // sorted by label
}

// What the document viewer should show (docs/CONTRACT.md §4).
export interface ViewerTarget {
	documentId: string;
	page: number; // 1-based
	quote?: string; // text to highlight on that page
}

// What the document viewer should show; see docs/CONTRACT.md §4.
export interface ViewerTarget {
	documentId: string;
	page: number; // 1-based
	quote?: string; // text to highlight on that page
}

// Conflict check API; see docs/CONTRACT.md §5.
export interface ConflictSource {
	document_id: string;
	label: string;
	page: number;
	quote: string;
}

export interface Conflict {
	id: string;
	title: string;
	severity: "high" | "medium" | "low";
	summary: string;
	sources: ConflictSource[];
}

export interface ConflictReport {
	status: "not_applicable" | "ready";
	conflicts: Conflict[];
}
