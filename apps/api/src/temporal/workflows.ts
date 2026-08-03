import { proxyActivities, defineSignal, setHandler, condition } from "@temporalio/workflow"
import * as activities from "./activities"


const { updateJobStatus, executeAgenttask, notifyUser } = proxyActivities<typeof activities>({
    startToCloseTimeout: "5 minutes",
    retry: { maximumAttempts: 3 }
})


// Signal frontend triggers when user click approved
export const approveSignal = defineSignal("approveJob")

export async function agentTaskWorkflow(jobId: string, prompt: string, requiresApproval: boolean) {
    let isApproved = false;

    // listen to signal
    setHandler(approveSignal, () => {
        isApproved = true
    })

    if (requiresApproval) {
        await updateJobStatus(jobId, "WATING_APPROVAL");
        await notifyUser(jobId, "A background Job requires your approval");

        await condition(() => isApproved)  // Pauses workflow
    }

    await updateJobStatus(jobId, "RUNNING")

    try {
        const result = await executeAgenttask(prompt);
        await updateJobStatus(jobId, "COMPLETED", result)
        await notifyUser(jobId, 'Your background r=task has finished Succesfully')
        return result
    }
    catch (err: any) {
        await updateJobStatus(jobId, "FAILED", err.message)
        throw err
    }
}  