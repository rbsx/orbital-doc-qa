import { motion } from "framer-motion";
import { Bot, ShieldCheck } from "lucide-react";
import { type ComponentProps, useMemo } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { CITATION_HREF_PREFIX, prepareCitations } from "../lib/citations";
import type { Citation, Message, ViewerTarget } from "../types";
import { CitationChip } from "./CitationChip";

interface AnswerProps {
	content: string;
	// Checked citations from the server; absent while the answer is streaming.
	citations?: Citation[];
	streaming?: boolean;
	onOpenSource?: (target: ViewerTarget) => void;
}

/** Markdown answer with its [[D1 p4: "…"]] markers rendered as citation chips. */
function Answer({ content, citations, streaming, onOpenSource }: AnswerProps) {
	const { markdown, markers } = prepareCitations(content);

	const components = useMemo(
		() => ({
			a: ({
				href,
				children,
				node: _node,
				...props
			}: ComponentProps<"a"> & { node?: unknown }) => {
				if (!href?.startsWith(CITATION_HREF_PREFIX)) {
					return (
						<a href={href} target="_blank" rel="noreferrer" {...props}>
							{children}
						</a>
					);
				}
				const index = Number(href.slice(CITATION_HREF_PREFIX.length));
				const marker = markers[index];
				if (!marker) return null;
				const citation = citations?.[index];
				const documentId = citation?.document_id;
				return (
					<CitationChip
						label={marker.label}
						page={marker.page}
						quote={marker.quote}
						citation={citation}
						onOpen={
							documentId && onOpenSource
								? () =>
										onOpenSource({
											documentId,
											page: marker.page,
											quote: marker.quote,
										})
								: undefined
						}
					/>
				);
			},
		}),
		[markers, citations, onOpenSource],
	);

	return (
		<div className="prose">
			<Streamdown
				mode={streaming ? "streaming" : undefined}
				components={components}
			>
				{markdown}
			</Streamdown>
		</div>
	);
}

function CitationSummary({ citations }: { citations: Citation[] }) {
	if (citations.length === 0) return null;
	const verified = citations.filter((c) => c.verified).length;
	const missing = citations.length - verified;
	return (
		<p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
			<ShieldCheck className="h-3.5 w-3.5" />
			{verified} of {citations.length} quote{citations.length !== 1 ? "s" : ""}{" "}
			verified against the source
			{missing > 0 && (
				<span className="text-amber-700">
					· {missing} not found, check before relying on{" "}
					{missing === 1 ? "it" : "them"}
				</span>
			)}
		</p>
	);
}

interface MessageBubbleProps {
	message: Message;
	onOpenSource?: (target: ViewerTarget) => void;
}

export function MessageBubble({ message, onOpenSource }: MessageBubbleProps) {
	if (message.role === "system") {
		return (
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex justify-center py-2"
			>
				<p className="text-xs text-neutral-400">{message.content}</p>
			</motion.div>
		);
	}

	if (message.role === "user") {
		return (
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
				className="flex justify-end py-1.5"
			>
				<div className="max-w-[75%] rounded-2xl rounded-br-md bg-neutral-100 px-4 py-2.5">
					<p className="whitespace-pre-wrap text-sm text-neutral-800">
						{message.content}
					</p>
				</div>
			</motion.div>
		);
	}

	// Assistant message
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2 }}
			className="flex gap-3 py-1.5"
		>
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				<Answer
					content={message.content}
					citations={message.citations}
					onOpenSource={onOpenSource}
				/>
				<CitationSummary citations={message.citations} />
			</div>
		</motion.div>
	);
}

interface StreamingBubbleProps {
	content: string;
}

export function StreamingBubble({ content }: StreamingBubbleProps) {
	return (
		<div className="flex gap-3 py-1.5">
			<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-neutral-900">
				<Bot className="h-4 w-4 text-white" />
			</div>
			<div className="min-w-0 max-w-[80%]">
				{content ? (
					<Answer content={content} streaming />
				) : (
					<div className="flex items-center gap-1 py-2">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.15s" }}
						/>
						<span
							className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400"
							style={{ animationDelay: "0.3s" }}
						/>
					</div>
				)}
				<span className="inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
			</div>
		</div>
	);
}
