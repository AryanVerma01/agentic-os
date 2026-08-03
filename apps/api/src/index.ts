import express from "express"
import cors from "cors"
import { chatRouter } from "./router/chat"
import { redis } from "./redis"
import "dotenv/config"
import { conversationRouter } from "./router/conversation"
import { initS3Bucket } from "./s3"
import { settingsRouter } from "./router/settings"
import { startTemporal } from "./temporal/worker"

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL || true }))
app.use(express.json())

app.use('/chat', chatRouter)
app.use('/conversation', conversationRouter);
app.use('/settings', settingsRouter);

async function main() {
    await redis.connect()
    await initS3Bucket()
    await startTemporal()
    app.listen(4000, () => {
        console.log("Express Server Running at port:4000")
    })
}

main()