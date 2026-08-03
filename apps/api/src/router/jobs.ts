import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { temporalClient } from "../temporal/worker";
import { approveSignal } from "../temporal/workflows";

const jobsRouter = Router();

jobsRouter.get("/", async (req: Request, res: Response) => {
    const jobs = await prisma.jobs.findMany();
    res.status(200).json(jobs)
})


jobsRouter.post("/", async (req: Request, res: Response) => {

    const prompt: string = req.body.prompt;
    const requiresApproval: boolean = req.body.requiresApproval

    const result = await prisma.jobs.create({
        data: {
            task_prompt: prompt,
            requires_approval: requiresApproval
        }
    });

    const JobId = result.id;

    // Trigger Temporal workflow
    await temporalClient.workflow.start("agentTaskWorkflow", {
        taskQueue: "agent-jobs",
        workflowId: `job-${JobId}`,
        args: [JobId, prompt, requiresApproval]
    })

    res.status(201).json({
        status: `scheduled`
    });
});

// Human in Loop Approval Endpoint
jobsRouter.post("/:id/approve", async (req: Request, res: Response) => {
    const { id } = req.params;

    const handle = temporalClient.workflow.getHandle(`job-${id}`);
    await handle.signal(approveSignal)

    res.json({
        success: true
    })
})