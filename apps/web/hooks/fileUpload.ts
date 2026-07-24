import { useState } from "react"
import "dotenv/config"

export function useFileUpload(sessionId: string) {

    const [fileUploading, setIsFileUploading] = useState(false)

    async function uploadFile(file: File) {
        setIsFileUploading(true);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/${sessionId}/uploads/presign`, {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fileName: file.name,
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
                method: 'PUT',
                headers: { "Content-Type": file.type },
                body: file
            })

            if (!putres.ok) {
                const errText = await putres.text().catch(() => "")
                console.error(`Storage upload failed with status ${putres.status}:`, errText)
                throw new Error(`Failed to upload to storage: ${putres.status}`)
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