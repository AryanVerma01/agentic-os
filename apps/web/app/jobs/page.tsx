// apps/web/app/jobs/page.tsx
"use client";

import { usePushNotifications } from "../../hooks/usePushNotification"
import { useState, useEffect } from "react";

type Job = {
    id: string;
    task_prompt: string;
    status: string;
    result: string | null;
    requires_approval: boolean;
    created_at: string;
};

export default function JobsPage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [prompt, setPrompt] = useState("");
    const [requiresApproval, setRequiresApproval] = useState(false);
    const { isSubscribed, subscribe } = usePushNotifications();

    // Poll for updates every 3 seconds (Simple alternative to SSE for jobs)
    useEffect(() => {
        const fetchJobs = () => {
            fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs`)
                .then(res => res.json())
                .then(setJobs);
        };
        fetchJobs();
        const interval = setInterval(fetchJobs, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, requiresApproval }),
        });
        setPrompt("");
    };

    const handleApprove = async (jobId: string) => {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/approve`, {
            method: "POST",
        });
    };

    return (
        <div className="max-w-5xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-gray-800 mb-8">Autonomous Jobs (Temporal)</h1>

            {!isSubscribed && (
                <button onClick={subscribe} className="bg-purple-100 text-purple-700 px-4 py-2 rounded font-semibold hover:bg-purple-200 transition">
                    🔔 Enable Push Alerts
                </button>
            )}

            {/* Schedule Form */}
            <form onSubmit={handleSchedule} className="bg-white p-6 rounded-xl shadow-sm border mb-8 flex gap-4 items-end">
                <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Agent Task</label>
                    <input
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="e.g. Research AI news and summarize..."
                        className="w-full p-2 border rounded"
                        required
                    />
                </div>
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={requiresApproval}
                        onChange={e => setRequiresApproval(e.target.checked)}
                    />
                    <span className="text-sm font-medium">Require Approval</span>
                </label>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 h-10">
                    Schedule Job
                </button>
            </form>

            {/* Jobs Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="p-4">Task</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Result</th>
                            <th className="p-4">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {jobs.map(job => (
                            <tr key={job.id}>
                                <td className="p-4 font-medium max-w-xs truncate">{job.task_prompt}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${job.status === "WAITING_APPROVAL" ? "bg-yellow-100 text-yellow-800" :
                                        job.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                                            job.status === "RUNNING" ? "bg-blue-100 text-blue-800 animate-pulse" :
                                                "bg-gray-100 text-gray-800"
                                        }`}>
                                        {job.status}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500 max-w-xs truncate">{job.result || "--"}</td>
                                <td className="p-4">
                                    {job.status === "WAITING_APPROVAL" && (
                                        <button
                                            onClick={() => handleApprove(job.id)}
                                            className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 shadow-sm"
                                        >
                                            Approve
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}