import express from "express"
import cors from "cors"
import { chatRouter } from "./router/chat"
import { redis } from "./redis"
import "dotenv/config"
import { conversationRouter } from "./router/conversation"
import { initS3Bucket } from "./s3"

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL || true }))
app.use(express.json())

app.use('/chat', chatRouter)
app.use('/conversation', conversationRouter);

async function startRedis() {
    await redis.connect()
    console.log(`Redis Connected`)
}

async function main() {
    await startRedis()
    await initS3Bucket()
    app.listen(4000, () => {
        console.log("Express Server Running at port:4000")
    })
}

main()