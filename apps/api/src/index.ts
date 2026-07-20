import express from "express"
import cors from "cors"
import { chatRouter } from "./router/chat"
import { redis } from "./redis"
import "dotenv/config"

const app = express()
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }))
app.use(express.json())

app.use('/chat', chatRouter)

async function startRedis() {
    await redis.connect()
    console.log(`Redis Connected`)
}

startRedis()
app.listen(4000, () => {
    console.log("Express Server Running at port:4000")
})