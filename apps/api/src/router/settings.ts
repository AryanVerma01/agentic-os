import { Request, Response, Router } from "express";
import { prisma } from "../db";
import { error } from "neo4j-driver";

export const settingsRouter = Router()


settingsRouter.get("/", async (req: Request, res: Response) => {
    try {
        const data = await prisma.userPreferences.findMany({
            where: {
                user_id: "mock-user-1"
            }
        })

        res.status(200).json({
            data
        })
    }
    catch (err: any) {
        res.json(401).json({
            error: `Error Fetching User Preferences from DB`
        })
    }
})

settingsRouter.post('/', async (req: Request, res: Response) => {

    const instructions = req.body;

    const prefres = await prisma.userPreferences.findFirst({
        where: {
            user_id: "mock-user-1"
        }
    })

    if (!prefres) {
        await prisma.userPreferences.create({
            data: {
                user_id: "mock-user-1",
                general_instructions: instructions
            }
        })
    }
    else {
        await prisma.userPreferences.update({
            where: {
                user_id: "mock-user-1"
            },
            data: {
                general_instructions: instructions
            }
        })
    }

    res.status(200).json({
        message: `User Preferences saved Successfully`
    })
})