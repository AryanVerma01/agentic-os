import { Router } from "express";
import { Request, Response } from "express";
import { prisma } from "../db"
import { error } from "node:console";
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

    const id = req.params.id;
    if (!id) return res.json({ error: `ConversationID is missing` })

    try {
        const conv = await prisma.conversation.findFirst({
            where: {
                id: JSON.stringify(id)
            }
        })


        if (!conv.share_token) {
            const token = crypto.randomUUID();

            await prisma.conversation.update({
                where: {
                    id: JSON.stringify(id)
                },
                data: {
                    share_token: token
                }
            })
            return res.json({ shareUrl: `${process.env.FRONTEND_URL}/share/${token}` })
        }
        else {
            return res.json({ shareUrl: `${process.env.FRONTEND_URL}/share/${conv.share_token}` })
        }
    }
    catch (err) {
        res.status(400).json({
            error: err
        })
    }
})

conversationRouter.get('/share/:token', async (req: Request, res: Response) => {

    const token = req.params.token

    if (!token) return res.json({ error: 'Token is missing' })

    try {
        const conv = await prisma.conversation.findFirst({
            where: {
                share_token: JSON.stringify(token)
            }
        })

        const messages = await prisma.message.findMany({
            where: {
                conversation_id: conv.id
            }
        })

        res.json({ conversation: conv, messages: messages })
    }
    catch (err) {
        res.json({ error: err })
    }
})