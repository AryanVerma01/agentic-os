import { useRef, useState } from "react";
import { file } from "zod";

export function useVoiceRecorder() {

    const [isRecording, setIsRecording] = useState(false)
    const mediaRecorderRef = useRef<MediaRecorder>(null)
    const chunksRef = useRef<BlobPart[] | null>(null)


    async function startRecording() {

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })     // stream audio from mic
        mediaRecorderRef.current = new MediaRecorder(stream)
        chunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => chunksRef.current?.push(e.data)
        mediaRecorderRef.current.start()
        setIsRecording(true)
    }


    function stopRecording(): Promise<File> {

        return new Promise((resolve) => {
            if (!mediaRecorderRef.current) return

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current!, { type: 'audio/webm' });           // convert audio data into blob
                const file = new File([blob], "voice-note.webm", { type: 'audio/webm' })         // create audio file from blob
                resolve(file)
                setIsRecording(false)

                mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())     // cleanup mic tracks
            }
            mediaRecorderRef.current?.stop();
        })
    }

    return { startRecording, stopRecording, isRecording }
}