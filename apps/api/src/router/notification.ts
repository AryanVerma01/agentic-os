import { Request, Response, Router } from "express";
import webpush from "web-push"
import "dotenv/config"
import { prisma } from "../db";

export const notificationRouter = Router()

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:your-email@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
)

notificationRouter.post("/subscribe", async (req: Request, res: Response) => {
    const { subscription } = req.body;
    const userId = "mock-user-1";

    if (!subscription || !subscription.endpoint) {
        res.status(400).json({
            error: "Invalid Subscription"
        })
    }

    const { endpoint, keys } = subscription;

    const result = await prisma.pushSubcriptions.create({
        data: {
            user_id: userId,
            endpoint: endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth
        }
    })

    res.status(201).json({
        success: true
    })
})