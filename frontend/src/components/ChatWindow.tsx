import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useConflicts } from "../hooks/use-conflicts";
import type { PendingUpload } from "../hooks/use-documents";
import { suggestedQuestions } from "../lib/suggestions";
import type { Document, Message, ViewerTarget } from "../types";
import { ChatInput } from "./ChatInput";
import { ConflictBanner } from "./ConflictBanner";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";
import { UploadProgress } from "./UploadProgress";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	documents: Document[];
	uploads: PendingUpload[];
	uploading: boolean;
	conversationId: string | null;
	// Changes whenever the conversation's set of documents does; drives the conflict check.
	onSend: (content: string) => void;
	onUpload: (files: File[]) => void;
	onDismissUpload: (key: string) => void;
	onOpenSource: (target: ViewerTarget) => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	documents,
	uploads,
	uploading,
	conversationId,
	onSend,
	onUpload,
	onDismissUpload,
	onOpenSource,
}: ChatWindowProps) {
	const documentCount = documents.length;
	const bannerElement = error && (
		<div
			role="alert"
			className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600"
		>
			{error}
		</div>
	);
	// Re-checked for conflicts whenever the set of documents changes.
	const documentsKey = documents.map((d) => d.id).join(",");
	const conflicts = useConflicts(conversationId, documentsKey);
	const conflictBanner = (
		<ConflictBanner
			report={conflicts.report}
			loading={conflicts.loading}
			error={conflicts.error}
			onRetry={conflicts.retry}
			onAsk={onSend}
			askDisabled={streaming}
			onOpenSource={onOpenSource}
			documents={documents}
		/>
	);
	// Upload errors are shown per file, next to the input they came from.
	const chatInput = (
		<ChatInput
			onSend={onSend}
			onUpload={onUpload}
			disabled={streaming}
			uploading={uploading}
			attachments={
				<UploadProgress uploads={uploads} onDismiss={onDismissUpload} />
			}
		/>
	);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive or during streaming
	const messagesLength = messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and streamingContent are intentional triggers for auto-scroll
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messagesLength, streamingContent]);

	// Loading messages (not when a brand-new chat is already showing its first
	// question and answer)
	if (loading && messages.length === 0 && !streaming) {
		return (
			<div className="flex flex-1 items-center justify-center bg-white">
				<Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
			</div>
		);
	}

	// Empty conversation - show upload prompt
	if (messages.length === 0 && !streaming) {
		return (
			<div className="flex flex-1 flex-col bg-white">
				{bannerElement}
				{conflictBanner}
				<div className="flex flex-1 items-center justify-center">
					{documentCount > 0 ? (
						<div className="flex w-full max-w-md flex-col items-center px-4">
							<p className="text-sm text-neutral-500">
								{documentCount === 1
									? "1 document ready."
									: `${documentCount} documents ready.`}{" "}
								Ask anything, or start with:
							</p>
							<ul className="mt-4 flex w-full flex-col gap-2">
								{suggestedQuestions(documents.map((d) => d.filename)).map(
									(question) => (
										<li key={question}>
											<button
												type="button"
												disabled={streaming}
												onClick={() => onSend(question)}
												className="group flex w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:opacity-50"
											>
												<span className="flex-1">{question}</span>
												<ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500" />
											</button>
										</li>
									),
								)}
							</ul>
						</div>
					) : (
						<EmptyState onUpload={onUpload} uploading={uploading} />
					)}
				</div>
				{chatInput}
			</div>
		);
	}

	return (
		<div className="flex flex-1 flex-col bg-white">
			{bannerElement}
			{conflictBanner}

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl space-y-1">
					{messages.map((message) => (
						<MessageBubble
							key={message.id}
							message={message}
							documents={documents}
							onOpenSource={onOpenSource}
						/>
					))}
					{streaming && (
						<StreamingBubble content={streamingContent} documents={documents} />
					)}
				</div>
			</div>

			{chatInput}
		</div>
	);
}
