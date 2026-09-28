import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PendingUpload } from "../hooks/use-documents";
import type { Message, ViewerTarget } from "../types";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { MessageBubble, StreamingBubble } from "./MessageBubble";
import { UploadProgress } from "./UploadProgress";

interface ChatWindowProps {
	messages: Message[];
	loading: boolean;
	error: string | null;
	streaming: boolean;
	streamingContent: string;
	documentCount: number;
	uploads: PendingUpload[];
	uploading: boolean;
	conversationId: string | null;
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
	documentCount,
	uploads,
	uploading,
	conversationId,
	onSend,
	onUpload,
	onDismissUpload,
	onOpenSource,
}: ChatWindowProps) {
	const bannerElement = error && (
		<div
			role="alert"
			className="mx-4 mt-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600"
		>
			{error}
		</div>
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
				<div className="flex flex-1 items-center justify-center">
					{documentCount > 0 ? (
						<div className="text-center">
							<p className="text-sm text-neutral-500">
								{documentCount === 1
									? "1 document uploaded."
									: `${documentCount} documents uploaded.`}{" "}
								Ask a question to get started.
							</p>
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

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
				<div className="mx-auto max-w-2xl space-y-1">
					{messages.map((message) => (
						<MessageBubble
							key={message.id}
							message={message}
							onOpenSource={onOpenSource}
						/>
					))}
					{streaming && <StreamingBubble content={streamingContent} />}
				</div>
			</div>

			{chatInput}
		</div>
	);
}
