// apps/web/app/chat/page.tsx
"use client";

import { useState, useRef } from "react";
import { useAgentStream } from "../../hooks/agentStream";
import useFileUpload from "../../hooks/fileUpload";
import useVoiceRecorder from '../../hooks/voiceRecorder';

export default function ChatPage() {
    const sessionId = "session-12345";
    const { messages, sendMessage, isstreaming } = useAgentStream(sessionId);
    const { uploadFile, fileUploading: isUploading } = useFileUpload(sessionId);
    const { startRecording, stopRecording, isRecording } = useVoiceRecorder();

    const [input, setInput] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isstreaming || isUploading) return;
        sendMessage(input);
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
            await uploadFile(audioFile); // Uploads -> Transcribes -> Triggers Message automatically
        } else {
            await startRecording();
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 p-4 max-w-3xl mx-auto">
            {/* Header & Message List identical to Step 1... */}
            <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 mb-4 space-y-4 border border-gray-200">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                        <div className={`max-w-[75%] p-3 rounded-lg shadow-sm ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                            {/* Render Text */}
                            <div>{msg.content}</div>

                            {/* Render Attachments */}
                            {msg.attachments?.map((att, i) => (
                                <div key={i} className="mt-2 text-xs italic opacity-80">
                                    {att.type === "image" ? (
                                        <span className="flex items-center gap-1">🖼️ Attached Image</span>
                                    ) : att.type === "audio" ? (
                                        <span className="flex items-center gap-1">🎤 Voice Note</span>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2 items-center">
                {/* Hidden File Input */}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,application/pdf" />

                {/* Attachment Button */}
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isstreaming} className="p-3 text-gray-500 hover:text-gray-800 transition disabled:opacity-50">
                    📎
                </button>

                {/* Voice Button */}
                <button type="button" onClick={handleVoiceToggle} disabled={isUploading || isstreaming} className={`p-3 transition rounded-full ${isRecording ? "bg-red-500 text-white animate-pulse" : "text-gray-500 hover:text-gray-800"}`}>
                    🎤
                </button>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isstreaming || isUploading}
                    placeholder={isUploading ? "Uploading..." : "Type a message..."}
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" disabled={isstreaming || isUploading || !input.trim()} className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition">
                    Send
                </button>
            </form>
        </div>
    );
}