import { Router } from "express";
import { Request, Response } from "express";
import { prisma } from "../db"
export const conversationRouter = Router();

// List of all conversation for sidebar
conversationRouter.get('/', async (req: Request, res: Response) => {
    try {
        const user_id = "mock-user-1"

        const conv = await prisma.conversation.findMany({
            where: {
                user_id: user_id
            }
        })

        res.status(200).json(conv)
    }
    catch (err) {
        res.status(400).json({
            error: err
        })
    }
})

// All messages of a conversation
conversationRouter.get('/:id/messages', async (req: Request, res: Response) => {
    try {
        const id = req.params.id

        if (!id) return res.json({ error: `ConversationID is missing` })

        const messages = await prisma.message.findMany({
            where: {
                conversation_id: JSON.stringify(id)
            }
        })

        res.status(200).json(messages)
    }
    catch (err) {
        res.status(400).json({ error: err })
    }
})

// Generate Share URL 
conversationRouter.post('/:id/share', async (req: Request, res: Response) => {

})