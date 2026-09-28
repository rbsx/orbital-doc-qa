import { AnimatePresence, motion } from "framer-motion";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { relativeTime } from "../lib/utils";
import type { Conversation } from "../types";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface ChatSidebarProps {
	conversations: Conversation[];
	selectedId: string | null;
	loading: boolean;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onDelete: (id: string) => void;
}

export function ChatSidebar({
	conversations,
	selectedId,
	loading,
	onSelect,
	onCreate,
	onDelete,
}: ChatSidebarProps) {
	return (
		<div className="flex h-full w-[250px] flex-shrink-0 flex-col border-r border-neutral-200 bg-white">
			<div className="flex items-center justify-between border-b border-neutral-100 p-3">
				<span className="text-sm font-semibold text-neutral-700">Chats</span>
				<Button variant="ghost" size="icon" onClick={onCreate} title="New chat">
					<MessageSquarePlus className="h-4 w-4" />
				</Button>
			</div>

			<ScrollArea className="flex-1">
				<div className="p-2">
					{loading && conversations.length === 0 && (
						<div className="space-y-2 p-2">
							{[1, 2, 3].map((i) => (
								<div key={i} className="animate-pulse space-y-1">
									<div className="h-4 w-3/4 rounded bg-neutral-100" />
									<div className="h-3 w-1/2 rounded bg-neutral-50" />
								</div>
							))}
						</div>
					)}

					{!loading && conversations.length === 0 && (
						<p className="px-2 py-8 text-center text-xs text-neutral-400">
							No conversations yet
						</p>
					)}

					<AnimatePresence initial={false}>
						{conversations.map((conversation) => (
							<motion.div
								key={conversation.id}
								initial={{ opacity: 0, height: 0 }}
								animate={{ opacity: 1, height: "auto" }}
								exit={{ opacity: 0, height: 0 }}
								transition={{ duration: 0.15 }}
							>
								{/* Select and delete are sibling buttons: nesting them was invalid
								    HTML, and delete only existed on mouse hover, so keyboard and
								    screen-reader users could never reach it. */}
								<div
									className={`group flex items-center rounded-lg transition-colors ${
										selectedId === conversation.id
											? "bg-neutral-100"
											: "hover:bg-neutral-50"
									}`}
								>
									<button
										type="button"
										aria-current={
											selectedId === conversation.id ? "page" : undefined
										}
										className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"
										onClick={() => onSelect(conversation.id)}
									>
										<p className="truncate text-sm font-medium text-neutral-800">
											{conversation.title}
										</p>
										<p className="mt-0.5 text-xs text-neutral-400">
											{relativeTime(conversation.updated_at)}
											{conversation.document_count > 0 &&
												` · ${conversation.document_count} ${
													conversation.document_count === 1
														? "document"
														: "documents"
												}`}
										</p>
									</button>

									<button
										type="button"
										aria-label={`Delete conversation: ${conversation.title}`}
										title="Delete conversation"
										className="mr-2 flex-shrink-0 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 group-hover:opacity-100"
										onClick={() => onDelete(conversation.id)}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</ScrollArea>
		</div>
	);
}
