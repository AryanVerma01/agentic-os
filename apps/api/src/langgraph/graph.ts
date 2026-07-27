import { AIMessage, SystemMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ConditionalEdgeRouter, END, GraphNode, MessagesValue, ReducedValue, START, StateGraph, StateSchema } from "@langchain/langgraph"
import "dotenv/config"
import { SYSTEM_PROMPT } from "./prompt"
import crypto from "crypto"
import { redis } from "../redis"
import { getVectorStore } from "../rag/store"
import { web_search } from "./tools/websearch"

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3.6-flash',
    apiKey: GOOGLE_API_KEY
})

const add = tool(({ a, b }) => {
    return a + b   // was missing `return` — body was `{ a + b }` (statement, not expression)
}, {
    name: "add",
    description: "add two numbers",
    schema: z.object({
        a: z.number().describe("First Number"),
        b: z.number().describe("Second Number")
    })
})

const multiply = tool(({ a, b }) => {
    return a * b   // same — was `{ a * b }` with no return
}, {
    name: "multiply",
    description: "Multiply two numbers",
    schema: z.object({
        a: z.number().describe("First Number"),
        b: z.number().describe("Second Number")
    })
})

const ragSearchTool = tool(async ({ query, sessionId }) => {
    // Check Redis Cache for same query result 
    const queryHash = crypto.createHash("sha256").update(query.toLowerCase()).digest("hex");
    const cacheKey = `ragcache:${sessionId}:${queryHash}`

    const cached = await redis.get(cacheKey);
    if (cached) {
        console.log(`[RAG Cache Hit]: ${query}`)
        return cached
    }

    const vectorDB = await getVectorStore();
    const result = await vectorDB.similaritySearch(query, 4, {
        must: [
            {
                key: "sessionId",
                match: {
                    value: sessionId      // It search oonly chunks with user's session-ID
                }
            }
        ]
    })

    if (result.length === 0) {
        return "No relevant Document found in this conversation's upload"
    }

    // Combine Text in result 
    const combinedText = result.map((r, i) => `[Doc ${i + 1}]: ${r.pageContent}`).join("\n\n")

    await redis.set(cacheKey, combinedText, { EX: 1800 })      // Save the query and result in redis Cache for 30 min

    return combinedText

}, {
    name: "rag_search",
    description: "Search through the PDFs and documents the user has uploaded in this specific session",
    schema: z.object({
        query: z.string().describe("Search query"),
        sessionId: z.string().describe("current Session ID")
    })
})

const toolByName: Record<string, any> = {
    [add.name]: add,
    [multiply.name]: multiply,
    [web_search.name]: web_search,
    [ragSearchTool.name]: ragSearchTool
}

const tools = Object.values(toolByName)
const modelwithTools = model.bindTools(tools)

// Graph State
const MessageState = new StateSchema({
    messages: MessagesValue,
    llmCalls: new ReducedValue(
        z.number().default(0),
        { reducer: (x: number, y: number) => x + y }
    )
})

// Model Node 
const llmCall: GraphNode<typeof MessageState> = async (state) => {
    const res = await modelwithTools.invoke([
        new SystemMessage(SYSTEM_PROMPT.text),
        ...state.messages
    ])

    return {
        messages: [res],
        llmCalls: 1
    }
}

// Tool Node
const toolNode: GraphNode<typeof MessageState> = async (state) => {
    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !(lastMessage instanceof AIMessage)) {
        return { messages: [] };
    }

    const result = []

    for (const toolCall of lastMessage.tool_calls ?? []) {
        const tool = toolByName[toolCall.name]
        if (tool) {
            const observation = await tool.invoke(toolCall)
            result.push(observation)
        }
    }

    return { messages: result }
}

// Condition Logic
const shouldContinue: ConditionalEdgeRouter<typeof MessageState, Record<string, any>, "toolNode"> = (state) => {

    const lastMessage = state.messages.at(-1);

    if (!lastMessage || !(lastMessage instanceof AIMessage)) {
        return END
    }

    if (lastMessage.tool_calls?.length) {
        return "toolNode"
    }

    return END
}

// Build and Compile Graph
export const graph = new StateGraph(MessageState)
    .addNode("llmCall", llmCall)
    .addNode("toolNode", toolNode)
    .addEdge(START, "llmCall")
    .addConditionalEdges("llmCall", shouldContinue, ['toolNode', END])
    .addEdge("toolNode", "llmCall")
    .compile()
