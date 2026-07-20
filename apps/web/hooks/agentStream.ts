// NEXT_PUBLIC_* env vars are automatically available in the browser via Next.js
import { useEffect, useState } from "react";

export interface Message {
    role: "user" | "agent";
    content: string;
}

export function useAgentStream(sessionId: string) {

    const [messages, setMessages] = useState<Message[]>([]);    // {role : string, content : string}
    const [isstreaming, setIsstreaming] = useState(false);

    // Set up SSE connection
    useEffect(() => {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/stream`;
        const es = new EventSource(url)

        es.addEventListener("history", (e) => {
            const data = JSON.parse(e.data)   // data converted from string to array
            setMessages(data.messages)
        })

        es.addEventListener("token", (e) => {
            const data = JSON.parse(e.data)
            setIsstreaming(true)

            setMessages((prev) => {
                const allMessages = [...prev]      // array of all messages
                const lastMessage = allMessages[allMessages.length - 1]

                if (lastMessage && lastMessage.role === "agent") {
                    lastMessage.content += data.text   // if message exist append new token to content 
                }
                else {
                    allMessages.push({ role: "agent", content: data.text }) // if it is first token create new message
                }

                return allMessages;
            })
        })

        es.addEventListener("done", () => {
            setIsstreaming(false)
        })

        return () => {
            es.close()
        }
    }, [sessionId])

    // send prompt to backend
    const sendMessage = async (content: string) => {

        setMessages((prev) => [...prev, { role: 'user', content: content }])

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/messages`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content })
        })

        if (!res.ok) {
            if (res.status === 429) alert("Rate Limit execedded: ")
            else alert("Failed to send message")
        }
    }

    return { messages, sendMessage, isstreaming }   // agent streaming hook (function) return all messages , sendMessage , isstreaming
}