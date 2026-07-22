import { z } from "zod";

export type SSEEventMap = {
    history: any,
    token: any,
    done: any,
    trace: any
}

export type SSEEventType = keyof SSEEventMap;

export const SendMessageSchema = z.object({
    content: z.string().min(1),
    parent_message_id: z.string().nullable().optional()
})

export const PresignRequestSchema = z.object({
    fileName: z.string(),
    ContentType: z.string(),
    size: z.number()
})