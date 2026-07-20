import "dotenv/config"
    ;
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function request(path: string, init?: RequestInit) {

    const res = await fetch(`${BASE_URL}${path}`, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...init?.headers
        },
        ...init
    })

    if (!res.ok) {
        throw new Error(`API Error: ${res.status}`)
    }

    return res.json()
}

export const api = {
    get: (path: string) => request(path),
    post: (path: string, body?: unknown) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
    put: (path: string, body?: unknown) => request(path, { method: "PUT", body: JSON.stringify(body) }),
    delete: (path: string) => request(path, { method: "DELETE" })
}