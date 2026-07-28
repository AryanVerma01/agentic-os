import { tool } from "@langchain/core/tools"
import crypto from "crypto"
import { redis } from "../../redis"
import { getVectorStore } from "../../rag/store"
import { z } from "zod"

export const ragSearchTool = tool(async ({ query, sessionId }) => {
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
