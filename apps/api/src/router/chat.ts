import { Router, Request, Response } from "express";
import { checkRateLimit, redis } from "../redis";
export const chatRouter = Router();
import { SendMessageSchema } from "@agentic-os/shared-types/SendMessageSchema"
import { uploadRouter } from "./upload";
import { prisma } from "../db";
import { graph } from "../langgraph/graph";

// streamRegistry stores connected client response object (SSE stream)
const streamRegistry = new Map();
// streamRegistry = [{
//     "sessionId": res
// }]

chatRouter.use("/:sessionId/uploads", uploadRouter);  // /chat/:sessionId/uploads

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


    // Clear previous attechemnts before clicking send
    const pendingRaw = await redis.lRange(`sessionId${sessionId}:pending_attachments`, 0, -1);
    await redis.del(`sessionId${sessionId}:pending_attachments`)

    const attachments = pendingRaw.map((a) => JSON.parse(a))

    const userMessage = {
        role: 'user',
        content: parsed.data.content,
        attachments
    }

    const conv = await prisma.conversation.findFirst({
        where: {
            id: JSON.stringify(sessionId)
        }
    })

    if (!conv) {
        await prisma.conversation.create({
            data: {
                id: JSON.stringify(sessionId),
                user_id: 'mock-user-1'
            }
        })
    }


    // Update Redis History   
    const rawHistory = await redis.hGet(`session:${sessionId}`, "messages");
    const messages = rawHistory ? JSON.parse(rawHistory) : [];            // convert messages into an array

    messages.push(userMessage)

    // Store message in userMsg Postgres
    await prisma.message.create({
        data: {
            conversation_id: JSON.stringify(sessionId),
            role: 'user',
            content: parsed.data.content,
            parent_message_id: parsed.data.parent_message_id
        }
    })

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

    // Store message AgentMsg in Postgres
    await prisma.message.create({
        data: {
            conversation_id: JSON.stringify(sessionId),
            role: 'agent',
            content: agentMessage.content,
            parent_message_id: parsed.data.parent_message_id
        }
    })
})