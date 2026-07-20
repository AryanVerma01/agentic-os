import {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand,
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