import { Router } from "express";
export const uploadRouter = Router({ mergeParams: true });
import { Request, Response } from "express";
import { checkRateLimit, redis } from "../redis";
import { PresignRequestSchema } from "@agentic-os/shared-types/presignRequestSchema";
import { BUCKET_NAME, generatePresignedGet, getPresignedPut, s3Client } from "../s3";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getDocumentProxy, extractText } from "unpdf"
import { storeDocinVectorDB } from "../rag/ingest";


// /upload/presign return presigned PUT url to client (Client upload to this url)
uploadRouter.post('/presign', async (req: Request, res: Response) => {

    const rawSessionId = req.params.sessionId;
    const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : (rawSessionId || "");
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

    const { fileName, contentType, size } = parsed.data;

    if (size > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "File too large" })
    }

    const key = `${sessionId}/${crypto.randomUUID()}-${fileName}`
    const url = await getPresignedPut(key, contentType);

    res.json({ url, key })
})

// Client tells that upload is comple and perform particular action with particular type of data
uploadRouter.post("/:key/complete", async (req: Request, res: Response) => {
    const rawSessionId = req.params.sessionId;
    const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : (rawSessionId || "");
    const rawKey = req.params.key;
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

    if (!key) return res.json({ error: 'key is not present' })


    try {
        // Check File exist in S3
        const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }))        // Finds the object in S3 
        const contentType = head.ContentType || "application/octet-stream"

        if (contentType.startsWith("image/")) {
            const attachment = { type: 'image', key, name: key.split('-').pop() }
            await redis.rPush(`sessionId:${sessionId}:pending_attachments`, JSON.stringify(attachment));
            return res.status(200).json({ success: true, attachment });
        }
        else if (contentType.startsWith('audio/')) {
            const attachment = { type: 'audio', key, name: key.split('-').pop() }
            await redis.rPush(`sessionId:${sessionId}:pending_attachments`, JSON.stringify(attachment));
            return res.status(200).json({ success: true, attachment });
        }
        else if (contentType === "application/pdf" || contentType.includes('document')) {
            const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
            const s3Res = await s3Client.send(command);

            const pdfBuffer: any = await streamToBuffer(s3Res.Body);
            const uint8Array = new Uint8Array(pdfBuffer);
            const pdfproxy = await getDocumentProxy(uint8Array);
            const parsedData = await extractText(pdfproxy, { mergePages: true });

            await storeDocinVectorDB(sessionId || "", parsedData.text, key);
            console.log(`PDF Stored in RAG for session ${sessionId}`);

            const attachment = { type: 'document', key, name: key.split('-').pop() };
            await redis.rPush(`sessionId:${sessionId}:pending_attachments`, JSON.stringify(attachment));

            return res.status(200).json({ success: true, textLength: extractedText.length, attachment });
        }
        else {
            return res.status(400).json({
                error: "Unsupported File type"
            })
        }
    }
    catch (err: any) {
        console.error("Error in upload complete:", err);
        return res.status(500).json({ error: `Failed to process uploaded file`, message: err?.message || String(err) })
    }
})


async function streamToBuffer(stream: any) {
    return new Promise((resolve, reject) => {
        const chunks: any = []
        stream.on("data", (chunk: any) => chunks.push(chunk))
        stream.on("error", reject)
        stream.on("end", () => resolve(Buffer.concat(chunks)))     // Buffer.concat converts list to buffer
    })
}