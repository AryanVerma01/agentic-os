import { QdrantVectorStore } from "@langchain/qdrant"
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import "dotenv/config"
import { Embeddings } from "@langchain/core/embeddings"

// Initialize embedding Model
const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: 'gemini-embedding-2'
})

// Intialize Qdrant Vector Store
export async function getVectorStore() {
    const vectorConfig = {
        url: process.env.QDRANT_URL,
        collection_name: 'agentos_documents'
    }

    try {
        return await QdrantVectorStore.fromExistingCollection(embeddings, vectorConfig)
    }
    catch (err) {

        // If collection does not exist create VectorDB with empty docs
        return await QdrantVectorStore.fromTexts(
            ["initialization"],
            [{ id: "init", sessionId: "system" }],
            embeddings,
            vectorConfig
        )
    }
}
