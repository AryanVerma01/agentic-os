
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { getVectorStore } from "./store"

export async function storeDocinVectorDB(sessionId: string, rawText: string, fileKey: string) {
    if (!rawText || !rawText.trim()) {
        console.warn(`storeDocinVectorDB called with empty text for Session ${sessionId}`);
        return;
    }

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200
    })

    const chunks = await splitter.createDocuments([rawText], [
        { sessionId, fileKey }      // metadata
    ])

    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments(chunks)

    console.log(`Stored ${chunks.length} Chunks for Session ${sessionId}`)
}