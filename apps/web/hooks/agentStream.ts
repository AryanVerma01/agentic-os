// apps/web/hooks/useAgentStream.ts
import { useEffect, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid"; // Make sure to import this for optimistic UI

export interface Message {
    id: string;
    role: "user" | "agent" | "system" | string;
    content: string;
    parentId?: string | null;
}

export function useAgentStream(sessionId: string) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        if (!sessionId) return;
        const url = `${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/stream`;
        const es = new EventSource(url);

        es.addEventListener("history", (e) => {
            const data = JSON.parse(e.data);
            setMessages(data.messages);
        });

        es.addEventListener("token", (e) => {
            const data = JSON.parse(e.data); // data has { text, messageId } from Step 1.6
            setIsStreaming(true);

            setMessages((prev) => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];

                if (lastMsg && lastMsg.role === "agent") {
                    lastMsg.content += data.text;
                } else {
                    // Store the agent's message ID provided by the backend
                    newMessages.push({ id: data.messageId, role: "agent", content: data.text, parentId: null });
                }
                return newMessages;
            });
        });

        es.addEventListener("done", () => setIsStreaming(false));

        return () => es.close();
    }, [sessionId]);

    // Update this function signature to accept parentId
    const sendMessage = useCallback(
        async (content: string, parentId?: string | null) => {

            // Optimistic UI update (needs a temporary ID to render in the tree)
            setMessages((prev) => [
                ...prev,
                {
                    id: uuidv4(),
                    role: "user",
                    content,
                    parentId: parentId || null
                }
            ]);

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/messages`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    // Include parent_message_id in the payload sent to Express!
                    body: JSON.stringify({ content, parent_message_id: parentId || null }),
                }
            );

            if (!res.ok) {
                if (res.status === 429) alert("Rate limit exceeded!");
                else alert("Failed to send message");
            }
        },
        [sessionId]
    );

    return { messages, sendMessage, isStreaming };
}