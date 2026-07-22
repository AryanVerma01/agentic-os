import React, { useEffect, useState } from "react";
import "dotenv/config"
import Link from "next/link";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    const [conv, setConv] = useState([])

    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/conversation`)
            .then((res) => res.json())
            .then(setConv)
    }, [])

    return (
        <div className="flex h-screen bg-gray-50">
            <aside className="w-64 bg-gray-900 text-white p-4 flex flex-col">
                <Link href="/chat/new" className="bg-blue-600 text-center py-2 rounded mb-4 hover:bg-blue-700">
                    + New Chat
                </Link>
                <div className="flex-1 overflow-y-auto space-y-2">
                    {conv.map((c: any) => (
                        <Link key={c.id} href={`/chat/${c.id}`} className="block p-2 hover:bg-gray-800 rounded truncate">
                            {c.title}
                        </Link>
                    ))}
                </div>
            </aside>
            <main className="flex-1 relative">{children}</main>
        </div>
    );
}