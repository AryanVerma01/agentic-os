import { tool } from "@langchain/core/tools";
import z from "zod";
import { withResilience } from "../../resilience";
import { neo4jDriver } from "../../memory/neo4j";


export async function saveGraphMemory(
    userId: string,
    subject: string,
    predicate: string,
    object: string
) {
    const session = neo4jDriver.session();
    // MERGE ensures dont create duplicate nodes
    // userId is attach to isolate memory b/w user 

    const query = `
            MERGE (s:Entity { name:$subject , userId: $userId })
            MERGE (o:Entity { name:$object , userId: $userId })
            MERGE (s)-[r:RELATED_TO {type: $predicate}]->(o)
            return s,r,o
        `

    await session.run(query, {
        userId,
        subject: subject.toLowerCase(),
        object: object.toLowerCase(),
        predicate: predicate.toUpperCase().replace(/\s+/g, "_")
    })

    console.log(`[Memory Saved] ${subject} -> ${predicate} -> ${object}`);
    await session.close();
}

const resilientSave = withResilience("Neo4jSave", saveGraphMemory, {})

export const saveMemoryTool = tool(async ({ subject, predicate, object }) => {

    try {
        resilientSave("mock-user-1", subject, predicate, object)
        return `Fact saved Successfully`
    }
    catch (err: any) {
        return `Failed to save memory: ${err.message}`
    }

}, {
    name: "save_memory",
    description: "Save an important fact about the user or their projects. Break facts into Subject, Predicate, Object. (e.g. Subject: 'User', Predicate: 'LIKES', Object: 'Python').",
    schema: z.object({
        subject: z.string(),
        predicate: z.string(),
        object: z.string()
    })
})


export async function searchGraphMemory(userId: string, queryEntity: string) {
    const session = neo4jDriver.session();
    try {

        const query = `
        MATCH (s:Entity {userId : $userId })-[r:RELATED_TO]-(o:Entity)
        WHERE s.name CONTAINS $queryEntity OR o.name CONTAINS $queryEntity
        RETURN s.name AS source, r.type AS relation, o.name AS target
        LIMIT 10
    `

        const result = await session.run(query, {
            userId,
            queryEntity: queryEntity.toLowerCase()
        })

        if (result.records.length === 0) {
            return `No relevant memories found`
        }

        return result.records.map((rec) => `${rec.get("source")} [${rec.get("relation")}] ${rec.get("target")}`).join("\n")

    }
    finally {
        await session.close()
    }
}

const resilientSearch = withResilience('Neo4jSearch', searchGraphMemory, {})


export const searchMemoryTool = tool(async ({ entity }) => {

    try {
        const results = await resilientSearch("mock-user-1", entity)
        return `Graph memory results: \n ${results}`
    }
    catch (err: any) {
        return `Failed to search Memory: ${err.message}`
    }
}, {
    name: "search_memory",
    description: "Recall past facts about an entity (like te user , a company or a project)",
    schema: z.object({
        entity: z.string().describe(`the core concept to search for (eg: 'User' , "Acme Corp")`)
    })
})