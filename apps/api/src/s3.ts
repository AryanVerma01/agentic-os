import {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand,
    HeadBucketCommand,
    PutBucketCorsCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    paginateListObjectsV2,
    GetObjectCommand
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import "dotenv/config"

export const s3Client = new S3Client({
    region: 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin"
    },
    forcePathStyle: true       // For Local S3
})

export const BUCKET_NAME = "agentos-uploads"

export async function initS3Bucket() {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }))
    } catch {
        try {
            await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }))
            console.log(`Created S3 Bucket: ${BUCKET_NAME}`)
        } catch (err) {
            console.error(`Failed to create bucket ${BUCKET_NAME}:`, err)
        }
    }

    try {
        await s3Client.send(new PutBucketCorsCommand({
            Bucket: BUCKET_NAME,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                        AllowedOrigins: ["*"],
                        ExposeHeaders: ["ETag"]
                    }
                ]
            }
        }))
        console.log(`Configured CORS for S3 Bucket: ${BUCKET_NAME}`)
    } catch (err) {
        console.error(`Failed to set CORS on bucket ${BUCKET_NAME}:`, err)
    }
}

// generate presigned PUT URL
export async function getPresignedPut(key: string, contentType: string) {
    const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, ContentType: contentType })
    return getSignedUrl(s3Client, command, { expiresIn: 300 }) // 5 minutes
}

// generate presigned GET URL -> Load image in UI 
export async function generatePresignedGet(key: string) {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 })  // 1 hour
}

// to store an object in s3 we require s3 client and put or get command we send URL to frontend instead of command and client