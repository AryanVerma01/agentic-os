import { SSEEventType } from "@agentic-os/shared-types/SSEEventType"
import "dotenv/config"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL

export function openStream(path: string, handlers: Partial<Record<SSEEventType, (data: any) => void>>) {

    const es = new EventSource(`${BASE_URL}${path}`, {
        withCredentials: true
    })

    for (const [event, handler] of Object.entries(handlers)) {
        es.addEventListener(event, (e: MessageEvent) => handler?.(JSON.parse(e.data)))
    }

    return () => es.close()            // caller's useEffect cleanup
}