// apps/web/app/settings/page.tsx
"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
    const [instructions, setInstructions] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`)
            .then(res => res.json())
            .then(data => setInstructions(data.general_instructions || ""));
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instructions }),
        });
        setSaving(false);
        alert("Preferences saved!");
    };

    return (
        <div className="max-w-2xl mx-auto p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Agent Memory & Settings</h1>

            <form onSubmit={handleSave} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-2">Explicit Instructions</h2>
                <p className="text-sm text-gray-500 mb-4">
                    These instructions are injected into the agent's core memory. It will always follow these rules across all conversations.
                </p>

                <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Always reply in Spanish. Never use emojis. I work at Apple."
                    className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-blue-500 outline-none"
                />

                <button
                    type="submit"
                    disabled={saving}
                    className="mt-4 bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save Preferences"}
                </button>
            </form>
        </div>
    );
}