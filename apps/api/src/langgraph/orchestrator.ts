import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { graph } from "./graph";
import { SYSTEM_PROMPT } from "./prompt";

export async function runOrchestrator(input: string | BaseMessage[], context: any = {}) {
    const inputMessages = typeof input === "string" ? [new HumanMessage(input)] : input;

    // 1. Invoke the LangGraph
    const finalState = await graph.invoke({
        messages: inputMessages,
    });

    const messages = finalState.messages;
    const lastMessage = messages[messages.length - 1];

    // 2. Extract internal LangGraph state (Which tools were actually called?)
    const toolsUsed: string[] = [];

    for (const msg of messages) {
        // If it's an AI message and contains tool_calls, record the tool names
        if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
            msg.tool_calls.forEach((tc) => toolsUsed.push(tc.name));
        }
    }

    // 3. Return the payload expected by our Eval Runner (and eventually the chat API)
    const output = lastMessage
        ? typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content)
        : "";

    return {
        output,
        promptVersion: SYSTEM_PROMPT.version,
        toolsUsed, // e.g., ["get_weather"]
    };
}
