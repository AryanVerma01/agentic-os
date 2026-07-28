import { AIMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ConditionalEdgeRouter, END, GraphNode, MessagesValue, ReducedValue, START, StateGraph, StateSchema } from "@langchain/langgraph"
import "dotenv/config"
import { SYSTEM_PROMPT } from "./prompt"
import { web_search } from "./tools/websearch"
import { fileSystemTool } from "./tools/filesystem"
import { codeExecTool } from "./tools/os-tools"
import { ragSearchTool } from "./tools/ragsearch"

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY

const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3.6-flash',
    apiKey: GOOGLE_API_KEY
})


const toolByName: Record<string, any> = {
    [web_search.name]: web_search,
    [ragSearchTool.name]: ragSearchTool,
    [fileSystemTool.name]: fileSystemTool,
    [codeExecTool.name]: codeExecTool
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
