
// listen for push events
self.addEventListener("push", (event) => {
    const data = event.data.json()

    const options = {
        body: data.message || "You have a new update",
        icon: "/favicon.ico",
        data: { jobId: data.jobId },
        requireInteraction: data.requireInteraction // keep it on screen until clicked
    }


    if (data.requiresAction) {
        options.actions = [
            { action: "approve", title: "Approve Job" },
            { action: "view", title: "View Details" }
        ]
    }

    event.waitUntil(self.ServiceWorkerRegistration.showNotification(data.title || "Agent OS", options))
})

self.addEventListener("notificationclick", (event) => {
    event.notification.close(); // Close the pop-up

    const { jobId } = event.notification.data;

    if (event.action === "approve" && jobId) {
        event.waitUntil(
            fetch(`http://localhost:4000/jobs/${jobId}/approve`, { method: "POST" })
        );
    } else {
        // Otherwise, just open the Jobs dashboard
        event.waitUntil(clients.openWindow("/jobs"));
    }
});