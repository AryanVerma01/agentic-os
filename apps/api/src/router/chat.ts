import { Router, Request, Response } from "express";
import { checkRateLimit, redis } from "../redis";
export const chatRouter = Router();
import { SendMessageSchema } from "@agentic-os/shared-types/SendMessageSchema"
import { graph } from "../langgraph/agent";
import { HumanMessage } from "@langchain/core/messages";

// streamRegistry stores connected client response object (SSE stream)
const streamRegistry = new Map();
// streamRegistry = [{
//     "sessionId": res
// }]


function sendSSE(res: Response, event: string, data: any) {
    res.write(`event: ${event}\ndata:${JSON.stringify(data)}\n\n`)
}

// This route (/chat/:sessionId/stream) establish an SSE connection with client and send history stored in redis 
chatRouter.get("/:sessionId/stream", async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    // Sets SSE connection to browser
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
    })
    res.flushHeaders();

    // Retreive previous messages from redis stored with sessionId incase of Reconnect
    const rawHistory = await redis.hGet(`session:${sessionId}`, "messages");
    const messages = rawHistory ? JSON.parse(rawHistory) : []   // parse => string to array

    sendSSE(res, "history", { messages })

    streamRegistry.set(sessionId, res)

    // When server send (close) event connection get closed
    req.on("close", () => {
        streamRegistry.delete(sessionId)
    })
})

// This Endpoint recieves prompt from user(frontend) send it to agent and stream the output to frontend via SSE and store the messages history in redis
chatRouter.post('/:sessionId/messages', async (req: Request, res: Response) => {

    const { sessionId } = req.params
    const ip = req.ip || "unknown"

    // Rate Limiting Max 10 messages per minute

    const allowed = await checkRateLimit(`ip:${ip}:msg`, 10, 60_000);

    if (!allowed) {
        return res.status(429).json({
            "error": "Too many Request"
        })
    }

    const parsed = SendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json(parsed.error)
    }

    const userMessage = new HumanMessage(parsed.data.content)

    // Update Redis Hsitory

    const rawHistory = await redis.hGet(`session:${sessionId}`, "messages");
    const messages = rawHistory ? JSON.parse(rawHistory) : [];            // convert messages into an array

    messages.push(userMessage)

    await redis.hSet(`session:${sessionId}`, "messages", JSON.stringify(messages));
    await redis.expire(`session:${sessionId}`, 86400)   // (24 hrs) Redis InMemory is cleared

    res.sendStatus(202)

    // fetch client response object connected to SSE stream
    const clientres = streamRegistry.get(sessionId)
    if (!clientres) return // client is not connected 

    const stream = await graph.stream(
        { messages: [userMessage] },
        { streamMode: "messages" }
    )

    const agentMessage = { role: "agent" as const, content: "" };

    for await (const [chunk] of stream) {
        // chunk.content can be a string or an array of content parts
        const raw = chunk?.content ?? ""
        const token = typeof raw === "string"
            ? raw
            : Array.isArray(raw)
                ? raw.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("")
                : ""
        if (token) {
            sendSSE(clientres, "token", { text: token })
            agentMessage.content += token
            console.log(token)
        }
    }

    sendSSE(clientres, "done", { status: "success" })

    // Store agent message in redis
    const currentHistory = await redis.hGet(`session:${sessionId}`, "messages");
    const msgs = currentHistory ? JSON.parse(currentHistory) : [];
    msgs.push(agentMessage)
    await redis.hSet(`session:${sessionId}`, "messages", JSON.stringify(msgs))

})