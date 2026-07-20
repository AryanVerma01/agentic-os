"use client"

import React, { useEffect, useRef, useState } from "react";
import { useAgentStream } from "../../hooks/agentStream"

export default function ChatPage() {

    const sessionId = "session-12345"
    const { messages, sendMessage, isstreaming } = useAgentStream(sessionId);
    const [input, setInput] = useState("");
    const endOfMessageRef = useRef<HTMLDivElement>(null);

    // Auto Scroll to bottom
    useEffect(() => {
        endOfMessageRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()   // it stops browser from refreshing the ChatPage

        if (!input.trim() || isstreaming) return
        sendMessage(input)
        setInput("")
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50 p-4 max-w-3xl mx-auto">
            <header className="mb-4 text-center">
                <h1 className="text-xl font-bold text-gray-800">AgentOS Core Loop</h1>
                <p className="text-xs text-gray-500">Session ID: {sessionId}</p>
            </header>

            <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow p-4 mb-4 space-y-4 border border-gray-200">
                {messages.length === 0 && (
                    <div className="text-gray-400 text-center mt-10">No messages yet. Say hello!</div>
                )}

                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div
                            className={`max-w-[75%] p-3 rounded-lg shadow-sm ${msg.role === "user"
                                ? "bg-blue-600 text-white"
                                : "bg-gray-100 text-gray-800"
                                }`}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isstreaming && (
                    <div className="text-xs text-gray-400 animate-pulse">Agent is typing...</div>
                )}
                <div ref={endOfMessageRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isstreaming}
                    placeholder="Type a message..."
                    className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                    type="submit"
                    disabled={isstreaming || !input.trim()}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition"
                >
                    Send
                </button>
            </form>
        </div>
    );
}


