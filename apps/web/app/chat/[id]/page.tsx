// apps/web/app/chat/[id]/page.tsx
"use client";

import { use, useState, useRef, useEffect } from "react";
import { useAgentStream } from "../../../hooks/agentStream";
import { useMessageTree } from "../../../hooks/useMessagetree";
import { useFileUpload } from "../../../hooks/fileUpload";
import { useVoiceRecorder } from "../../../hooks/voiceRecorder";

// In Next.js App Router (Next.js 15+), dynamic route params are passed as a Promise prop
export default function SingleChatPage({ params }: { params: Promise<{ id: string }> }) {
    // Unwrap params Promise using React's use() hook
    const { id: sessionId } = use(params);

    // Initialize all hooks using the specific sessionId
    const { messages, sendMessage, isStreaming } = useAgentStream(sessionId);
    const { uploadFile, fileUploading } = useFileUpload(sessionId);
    const { startRecording, stopRecording, isRecording } = useVoiceRecorder();

    // Local state
    const [activeLeafId, setActiveLeafId] = useState<string | null>(null);
    const [input, setInput] = useState("");

    const endOfMessagesRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Compute the linear thread from the raw message tree
    const { thread, childrenMap } = useMessageTree(messages, activeLeafId);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [thread, isStreaming]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isStreaming || fileUploading) return;

        // Send message, explicitly attaching it to the last message in the current thread
        const parentId = thread.length > 0 ? thread[thread.length - 1].id : null;
        sendMessage(input, parentId);
        setInput("");
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await uploadFile(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleVoiceToggle = async () => {
        if (isRecording) {
            const audioFile = await stopRecording();
            await uploadFile(audioFile);
        } else {
            await startRecording();
        }
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto p-4 relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800">Chat Session</h2>
                <span className="text-xs text-gray-400 font-mono bg-gray-100 p-1 rounded">
                    {sessionId}
                </span>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto space-y-6 mb-4 px-2 pb-4">
                {thread.length === 0 && (
                    <div className="text-center text-gray-400 mt-20">Type a message to start...</div>
                )}

                {thread.map((msg) => {
                    const siblings = childrenMap.get(msg.parentId) || [];
                    const currentIndex = siblings.indexOf(msg.id);

                    return (
                        <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                            {/* Message Bubble */}
                            <div className={`p-4 rounded-2xl max-w-[85%] shadow-sm ${msg.role === "user" ? "bg-blue-600 text-white rounded-br-none" : "bg-white border border-gray-200 rounded-bl-none text-gray-800"
                                }`}>
                                <div className="whitespace-pre-wrap">{msg.content}</div>

                                {/* Attachments UI */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-white/20 flex flex-col gap-1">
                                        {msg.attachments.map((att: any, i: any) => (
                                            <div key={i} className="text-sm flex items-center gap-2 opacity-90">
                                                {att.type === "image" && <span>🖼️ {att.name || "Image"}</span>}
                                                {att.type === "audio" && <span>🎤 Voice Note</span>}
                                                {att.type === "document" && <span>📄 {att.name || "Document"}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Branch Switcher (If message was edited/regenerated) */}
                            {siblings.length > 1 && (
                                <div className="text-xs text-gray-500 mt-2 flex gap-3 items-center bg-gray-100 px-3 py-1 rounded-full select-none">
                                    <button
                                        disabled={currentIndex === 0}
                                        onClick={() => setActiveLeafId(siblings[currentIndex - 1] || null)}
                                        className="hover:text-blue-600 disabled:opacity-30"
                                    > ◀ </button>
                                    <span className="font-mono">{currentIndex + 1} / {siblings.length}</span>
                                    <button
                                        disabled={currentIndex === siblings.length - 1}
                                        onClick={() => setActiveLeafId(siblings[currentIndex + 1] || null)}
                                        className="hover:text-blue-600 disabled:opacity-30"
                                    > ▶ </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Loading/Streaming indicator */}
                {isStreaming && (
                    <div className="text-sm text-gray-400 italic animate-pulse">Agent is typing...</div>
                )}
                <div ref={endOfMessagesRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2 items-end bg-white p-2 rounded-xl shadow-sm border border-gray-200">

                {/* Hidden File Input */}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />

                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={fileUploading || isStreaming} className="p-3 text-gray-400 hover:text-blue-600 transition disabled:opacity-50">
                    📎
                </button>

                <button type="button" onClick={handleVoiceToggle} disabled={fileUploading || isStreaming} className={`p-3 transition rounded-full ${isRecording ? "bg-red-500 text-white animate-pulse" : "text-gray-400 hover:text-blue-600"}`}>
                    🎤
                </button>

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
                    }}
                    disabled={isStreaming || fileUploading}
                    placeholder={fileUploading ? "Uploading file..." : "Type your message..."}
                    className="flex-1 p-3 max-h-32 resize-none bg-transparent focus:outline-none"
                    rows={1}
                />

                <button type="submit" disabled={isStreaming || fileUploading || !input.trim()} className="p-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition mb-1 mr-1">
                    Send
                </button>
            </form>
        </div>
    );
}