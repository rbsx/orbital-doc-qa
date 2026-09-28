import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useConflicts } from "../hooks/use-conflicts";
import type { Message, ViewerTarget } from "../types";
import { ChatInput } from "./ChatInput";
import { ConflictBanner } from "./ConflictBanner";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	hasDocument: boolean;
	uploading: boolean;
	uploadError: string | null;
	conversationId: string | null;
	// Changes whenever the conversation's set of documents does; drives the conflict check.
	documentsKey: string;
	onSend: (content: string) => void;
	onUpload: (file: File) => void;
	onOpenSource?: (target: ViewerTarget) => void;
}

export function ChatWindow({
	messages,
	loading,
	error,
	streaming,
	streamingContent,
	hasDocument,
	uploading,
	uploadError,
	conversationId,
	documentsKey,
	onSend,
	onUpload,
	onOpenSource,
}: ChatWindowProps) {
	const banner = uploadError ?? error;
	const bannerElement = banner && (
		<div
			role="alert"
			className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600"
		>
			{banner}
		</div>
	);
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

	// No conversation selected
	if (!conversationId) {
		return (
			<div className="flex flex-1 items-center justify-center bg-neutral-50">
				<div className="text-center">
					<p className="text-sm text-neutral-400">
						Select a conversation or create a new one
					</p>
				</div>
			</div>
		);
	}

	// Loading messages
	if (loading) {
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
					{hasDocument ? (
						<div className="text-center">
							<p className="text-sm text-neutral-500">
								Document uploaded. Ask a question to get started.
							</p>
						</div>
					) : (
						<EmptyState onUpload={onUpload} uploading={uploading} />
					)}
				</div>
				<ChatInput
					onSend={onSend}
					onUpload={onUpload}
					disabled={streaming}
					hasDocument={hasDocument}
					uploading={uploading}
				/>
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
						<MessageBubble key={message.id} message={message} />
					))}
					{streaming && <StreamingBubble content={streamingContent} />}
				</div>
			</div>

			<ChatInput
				onSend={onSend}
				onUpload={onUpload}
				disabled={streaming}
				hasDocument={hasDocument}
				uploading={uploading}
			/>
		</div>
	);
}
