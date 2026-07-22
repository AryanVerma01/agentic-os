// apps/web/app/chat/[id]/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useAgentStream } from "../../../hooks/agentStream";
import { useMessageTree } from "../../../hooks/useMessagetree";

export default function ChatPage({ params }: { params: { id: string } }) {
    const { messages, sendMessage, isstreaming } = useAgentStream(params.id);
    const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
    const [input, setInput] = useState("");

    const { thread, childrenMap } = useMessageTree(messages, activeLeafId);

    // If a user edits a past message, we send the edited text, but tell the API
    // to attach it to the parent of the message we are editing.
    const handleEditAndResend = (msg: any, newContent: string) => {
        sendMessage(newContent, msg.parent_message_id);
        // The SSE hook will automatically pick up the new message and we can switch activeLeafId
    };

    const shareConversation = async () => {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/conversations/${params.id}/share`, { method: "POST" });
        const { shareUrl } = await res.json();
        alert(`Share link created: ${shareUrl}`); // In reality, copy to clipboard
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Chat</h2>
                <button onClick={shareConversation} className="text-blue-500 text-sm">Share</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {thread.map((msg) => {
                    const siblings = childrenMap.get(msg.parentId) || [];
                    const currentIndex = siblings.indexOf(msg.id);

                    return (
                        <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            <div className={`p-3 rounded-lg max-w-[80%] ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border"}`}>
                                {msg.content}
                            </div>

                            {/* Branch Switcher: Shows if this message's parent has multiple children */}
                            {siblings.length > 1 && (
                                <div className="text-xs text-gray-400 mt-1 flex gap-2 items-center">
                                    <button
                                        disabled={currentIndex === 0}
                                        onClick={() => setActiveLeafId(siblings[currentIndex - 1] ?? null)}
                                    > ◀ </button>
                                    {currentIndex + 1} / {siblings.length}
                                    <button
                                        disabled={currentIndex === siblings.length - 1}
                                        onClick={() => setActiveLeafId(siblings[currentIndex + 1] ?? null)}
                                    > ▶ </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); sendMessage(input, thread[thread.length - 1]?.id); setInput(""); }} className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} disabled={isstreaming} className="flex-1 p-3 border rounded" placeholder="Type..." />
                <button type="submit" disabled={isstreaming} className="bg-blue-600 text-white px-6 py-3 rounded">Send</button>
            </form>
        </div>
    );
}