import { useCallback, useState } from "react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ChatWindow } from "./components/ChatWindow";
import { DocumentViewer } from "./components/DocumentViewer";
import { TooltipProvider } from "./components/ui/tooltip";
import { useConversations } from "./hooks/use-conversations";
import { useDocuments } from "./hooks/use-documents";
import { useMessages } from "./hooks/use-messages";
import type { ViewerTarget } from "./types";

export default function App() {
	const {
		conversations,
		selectedId,
		loading: conversationsLoading,
		create,
		select,
		remove,
		refresh: refreshConversations,
	} = useConversations();

	const {
		messages,
		loading: messagesLoading,
		error: messagesError,
		streaming,
		streamingContent,
		send,
	} = useMessages(selectedId);

	const {
		documents,
		uploads,
		uploading,
		upload,
		dismiss: dismissUpload,
	} = useDocuments(selectedId);

	// What the viewer shows (CONTRACT §4). Anything that points at a document
	// (file panel, citations, conflicts) goes through openSource.
	const [viewerTarget, setViewerTarget] = useState<ViewerTarget | null>(null);
	const openSource = useCallback((target: ViewerTarget) => {
		setViewerTarget(target);
	}, []);

	const [targetConversationId, setTargetConversationId] = useState(selectedId);
	if (selectedId !== targetConversationId) {
		setTargetConversationId(selectedId);
		setViewerTarget(null);
	}

	// Resolved against the current documents so the viewer never shows one
	// that isn't in this conversation: with no (valid) target, show D1.
	const targeted = documents.find((d) => d.id === viewerTarget?.documentId);
	const activeDocument = targeted ?? documents[0] ?? null;
	const activeDocumentId = activeDocument?.id;

	const handlePageChange = useCallback(
		(page: number) => {
			if (activeDocumentId)
				setViewerTarget({ documentId: activeDocumentId, page });
		},
		[activeDocumentId],
	);

	const handleSend = useCallback(
		async (content: string) => {
			await send(content);
			refreshConversations();
		},
		[send, refreshConversations],
	);

	const handleUpload = useCallback(
		async (files: File[]) => {
			// Show the first new document as soon as it arrives; the rest of the
			// batch lands in the file panel without pulling the viewer around.
			let opened = false;
			await upload(files, (document) => {
				if (opened) return;
				opened = true;
				openSource({ documentId: document.id, page: 1 });
			});
			// Picks up the new document counts and the conversation's new position.
			refreshConversations();
		},
		[upload, openSource, refreshConversations],
	);

	const handleCreate = useCallback(async () => {
		await create();
	}, [create]);

	return (
		<TooltipProvider delayDuration={200}>
			<div className="flex h-screen bg-neutral-50">
				<ChatSidebar
					conversations={conversations}
					selectedId={selectedId}
					loading={conversationsLoading}
					onSelect={select}
					onCreate={handleCreate}
					onDelete={remove}
				/>

				<ChatWindow
					messages={messages}
					loading={messagesLoading}
					error={messagesError}
					streaming={streaming}
					streamingContent={streamingContent}
					documentCount={documents.length}
					uploads={uploads}
					uploading={uploading}
					conversationId={selectedId}
					onSend={handleSend}
					onUpload={handleUpload}
					onOpenSource={openSource}
					onDismissUpload={dismissUpload}
				/>

				<DocumentViewer
					documents={documents}
					document={activeDocument}
					page={targeted ? (viewerTarget?.page ?? 1) : 1}
					quote={targeted ? viewerTarget?.quote : undefined}
					onPageChange={handlePageChange}
					onOpen={openSource}
				/>
			</div>
		</TooltipProvider>
	);
}
