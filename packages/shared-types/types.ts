import { z } from "zod";

export type SSEEventMap = {
    history: any,
    token: any,
    done: any,
    trace: any
}

export type SSEEventType = keyof SSEEventMap;

export const SendMessageSchema = z.object({
    content: z.string().min(1)
})