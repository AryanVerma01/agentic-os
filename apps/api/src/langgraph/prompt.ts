import { prisma } from "../db"

export const SYSTEM_PROMPT = {
    version: "1.0.0",
    text: `You are AgentOS , You are an helpful assistant
    If you dont konw the answer use web-search tool
    Never answer questions about legal activities`
}

export async function dynamicSystemPrompt() {

    const PreferencesResult = await prisma.userPreferences.findMany({
        where: {
            user_id: "mock-user-1"
        }
    })

    //@ts-ignore
    const userPreferences = PreferencesResult.general_instructions || 'no special instruction'

    return `${SYSTEM_PROMPT.text}\n\nUSER PREFERENCES: \n ${userPreferences}`
}