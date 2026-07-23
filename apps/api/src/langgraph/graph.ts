import { AIMessage, SystemMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ConditionalEdgeRouter, END, GraphNode, MessagesValue, ReducedValue, START, StateGraph, StateSchema } from "@langchain/langgraph"
import { tavily } from "@tavily/core"
import "dotenv/config"
import { SYSTEM_PROMPT } from "./prompt"

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3.5-flash',
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

const web_search = tool(async ({ query }) => {   // was `(query: string)` — schema says it's an object
    const result = await tvly.search(query)
    return JSON.stringify(result)   // was not returning result — model never saw search output
}, {
    name: "web_search",
    description: "Search the Web",
    schema: z.object({
        query: z.string().describe("Query")
    })
})


const toolByName: Record<string, any> = {
    [add.name]: add,
    [multiply.name]: multiply,
    [web_search.name]: web_search
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
