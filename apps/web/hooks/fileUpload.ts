import { useState } from "react"
import "dotenv/config"

export function useFileUpload(sessionId: string) {

    const [fileUploading, setIsFileUploading] = useState(false)

    async function uploadFile(file: File) {
        setIsFileUploading(true);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/uploads/presign`, {
                method: 'POST',
                headers: { "Content-type": "application/json" },
                body: JSON.stringify({
                    filename: file.name,
                    contentType: file.type,
                    size: file.size
                })
            })

            if (!res.ok) {
                if (res.status === 429) {
                    alert("Rate limit Exceded")
                }
                else {
                    throw new Error(`Failed to presign`)
                }
            }

            const { url, key } = await res.json()

            // Upload file on put url 
            const putres = await fetch(url, {
                method: 'POST',
                headers: { "Content-type": file.type },
                body: file
            })

            if (!putres.ok) {
                throw new Error(`Failed to upload to storage`)
            }

            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/uploads/${encodeURIComponent(key)}/complete`, {
                method: 'POST'
            })
        }
        catch (e) {
            console.error(e)
            alert("Upload Failed")
        }
        finally {
            setIsFileUploading(false)
        }
    }

    return { uploadFile, fileUploading }
} 