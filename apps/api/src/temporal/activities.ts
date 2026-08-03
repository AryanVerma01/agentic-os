import { prisma } from "../db";
import { runOrchestrator } from "../langgraph/orchestrator";
import webpush from "web-push"

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

export async function notifyUser(jobId: string, message: string, requiresAction: boolean = false) {

    const userId = "mock-user-1"

    const result = await prisma.pushSubcriptions.findMany({
        where: {
            user_id: userId
        }
    })

    const payload = JSON.stringify({
        title: "AgentOS Task",
        message,
        jobId,
        requiresAction
    })

    const pushPromise = result.map(async (row) => {
        const pushSub = {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth }
        }

        try {
            await webpush.sendNotification(pushSub, payload)
        }
        catch (err: any) {
            // delete if endpoint is expired
            if (err.statusCode === 410 || err.statusCode === 404) {
                await prisma.pushSubcriptions.delete({
                    where: {
                        endpoint: row.endpoint
                    }
                })
            }
        }
    })

    await Promise.all(pushPromise)
    console.log(`[Notification] jobId:${jobId} message:${message}`)
}