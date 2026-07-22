// apps/web/app/chat/page.tsx
"use client";

export default function ChatIndexPage() {
    return (
        <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-4">
            <div className="text-6xl">🤖</div>
            <h2 className="text-2xl font-semibold text-gray-600">Welcome to AgentOS</h2>
            <p>Select a conversation from the sidebar or start a new one.</p>
        </div>
    );
}