import { prisma } from "../db";
import { runOrchestrator } from "../langgraph/orchestrator";

export async function updateJobStatus(jobId: string, status: string, result?: string) {

    await prisma.jobs.update({
        where: {
            id: jobId
        },
        data: {
            status: status,
            result: result || ""
        }
    })
    console.log(`Job ${jobId} status -> ${status}`)
}

export async function executeAgenttask(prompt: string) {
    console.log(`[Activity] Execute Agent Task: ${prompt} `)
    const res = await runOrchestrator(prompt);
    return res.output
}

export async function notifyUser(jobId: string, message: string) {
    console.log(`[Notification] jobId:${jobId} message:${message}`)
}