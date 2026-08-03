import { Connection, Client } from "@temporalio/client"
import * as activities from "./activities";
import { Worker, NativeConnection } from "@temporalio/worker"

export let temporalClient: Client;

export async function startTemporal() {

    const clientConnection = await Connection.connect({ address: `localhost:7233` });
    temporalClient = new Client({ connection: clientConnection });

    const workerConnection = await NativeConnection.connect({ address: `localhost:7233` });

    const worker = await Worker.create({
        connection: workerConnection,
        namespace: "default",
        taskQueue: "agent-jobs",
        workflowsPath: require.resolve("./workflows"),
        activities
    });

    console.log(`Temporal Worker started Successfully`);
    worker.run().catch((err) => {
        console.error("Temporal Worker error:", err);
    });
}

