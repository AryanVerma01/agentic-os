import { tool } from "@langchain/core/tools";
import { tavily } from "@tavily/core";
import "dotenv/config"
import z from "zod";
import { withResilience } from "../../resilience";

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })

async function websearchAPI(query: string) {
    const result = await tvly.search(query)
    return result
}

const resilientWebSearch = withResilience("TavilyWebSearch", websearchAPI, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000,
    capacity: 3,  // No more than 3 searches at same time 
    maxRetries: 2
});


export const web_search = tool(async (query: string) => {
    try {
        console.log(`[TOOL] Executing Web Search for: ${query}`)

        const result = await resilientWebSearch(query);

        return result
    }
    catch (e: any) {
        console.error(`[TOOL ERROR] WEb Search Failed: ${e}`)
        return `Tell the user web search tool is unavaliable`
    }
}, {
    name: 'web-search',
    description: 'Search the web',
    schema: z.object({
        query: z.string().describe(`Search Query`)
    })
})