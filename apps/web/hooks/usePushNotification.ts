// apps/web/hooks/usePushNotifications.ts
import { useState, useEffect } from "react";

// Helper to convert VAPID string to Uint8Array (required by Browser API)
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications() {
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        // Register the Service Worker on mount
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/sw.js").catch(console.error);
        }
    }, []);

    const subscribe = async () => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            alert("Push notifications are not supported in this browser.");
            return;
        }

        const registration = await navigator.serviceWorker.ready;
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

        try {
            // Ask the OS/Browser for permission and generate the subscription object
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });

            // Send the subscription to our backend
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription: sub })
            });

            setIsSubscribed(true);
            alert("Notifications enabled!");
        } catch (err) {
            console.error("Failed to subscribe:", err);
            alert("Please allow notifications in your browser settings.");
        }
    };

    return { isSubscribed, subscribe };
}