// apps/web/app/chat/layout.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid"; // run: pnpm add uuid && pnpm add -D @types/uuid

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [convos, setConvos] = useState<{ id: string; title: string }[]>([]);

    // Fetch past conversations for the sidebar
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/conversation`)
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setConvos(data);
            })
            .catch((err) => console.error("Failed to load conversations", err));
    }, []);

    const handleNewChat = () => {
        // Generate a new ID client-side and navigate to it. 
        // It won't save to the DB until the user actually sends a message.
        const newId = uuidv4();
        router.push(`/chat/${newId}`);
    };

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col flex-shrink-0">
                <button
                    onClick={handleNewChat}
                    className="bg-blue-600 text-center font-medium py-3 rounded-lg mb-6 hover:bg-blue-700 transition"
                >
                    + New Chat
                </button>

                <div className="text-xs text-gray-400 font-semibold mb-2 uppercase tracking-wider">
                    Recent
                </div>

                <div className="flex-1 overflow-y-auto space-y-1">
                    {convos.length === 0 && (
                        <div className="text-gray-500 text-sm italic">No history yet.</div>
                    )}
                    {convos.map((c) => (
                        <Link
                            key={c.id}
                            href={`/chat/${c.id}`}
                            className="block p-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg truncate transition"
                        >
                            {c.title || "New Conversation"}
                        </Link>
                    ))}
                </div>
            </aside>

            {/* Main Content Area (renders page.tsx or [id]/page.tsx) */}
            <main className="flex-1 relative h-full">
                {children}
            </main>
        </div>
    );
}