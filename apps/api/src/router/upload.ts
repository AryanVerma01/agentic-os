import { Router } from "express";
export const uploadRouter = Router();
import { Request, Response } from "express";
import { checkRateLimit, redis } from "../redis";
import { PresignRequestSchema } from "@agentic-os/shared-types/presignRequestSchema";
import { BUCKET_NAME, getPresignedPut, s3Client } from "../s3";
import { HeadObjectCommand } from "@aws-sdk/client-s3";


// /upload/presign return presigned PUT url to client (Client upload to this url)
uploadRouter.post('/presign', async (req: Request, res: Response) => {

    const { sessionId } = req.params;
    const ip = req.ip;
    const allowed = await checkRateLimit(`ip:${ip}:upload`, 10, 60_000)       // 10 Request per minute

    if (!allowed) {
        return res.status(429).json({
            'error': 'Too many uploads'
        })
    }

    const parsed = PresignRequestSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json(parsed.error)
    }

    const { fileName, ContentType, size } = parsed.data;

    if (size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "File too large" })
    }

    const key = `${sessionId}/${crypto.randomUUID()}-${fileName}`
    const url = await getPresignedPut(key, ContentType);

    res.json({ url, key })
})

// Client tells that upload is complete - sends key to get GET url
uploadRouter.post("/:key/complete", async (req: Request, res: Response) => {
    const { sessionId, key } = req.params;
    const ip = req.ip;

    if (!key) return res.json({ error: 'key is not present' })


    try {
        // Check File exist in S3
        const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: JSON.stringify(key) }))        // Finds the object in S3 
        const contentType = head.ContentType || "application/octet-stream"

        if (contentType.startsWith("image/")) {
            const attachment = { type: 'image', key, name: JSON.stringify(key).split('-').pop() }

            await redis.rPush(`sessionId:${sessionId}:pending_attachments`, JSON.stringify(attachment));
        }
        else if (contentType.startsWith('audio/')) {
            // // 2. VOICE: Transcribe immediately, then trigger the agent loop as if user typed it
            // const transcript = await mockTranscribeAudio(key);
            // const attachment: Attachment = { type: "audio", key };

            // // Force trigger the chat loop (simulating a user POSTing a message)
            // await triggerAgentLoop(sessionId, transcript, [attachment]);
            // res.sendStatus(202);

        }
        else if (contentType === "application/pdf" || contentType.includes('document')) {
            // RAG Integration

            // await mockEnqueueRAGingest();
            // res.json({ message: "Document queued for processing" })
        }
        else {
            res.status(400).json({
                error: "Unsupported File type"
            })
        }
    }
    catch (err) {
        res.status(404).json({ error: `File not found in storage` })
    }
})  