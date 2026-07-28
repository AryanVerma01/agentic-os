
import Docker from 'dockerode'
import fs from "fs"
import path from "path"

const docker = new Docker();

const HOST_WORKSPACE_DIR = path.join(process.cwd(), ".workspace")   // process.cwd return current working directory
if (!fs.existsSync(HOST_WORKSPACE_DIR)) {
    fs.mkdirSync(HOST_WORKSPACE_DIR)
}

export async function createSandbox(sessionId: string) {
    const containerName = `agentos-sandbox-${sessionId}`
    const workspacePath = path.join(HOST_WORKSPACE_DIR, sessionId)

    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath)
    }

    try {
        const container = await docker.createContainer({
            Image: 'python:3.11-slim',
            name: containerName,
            Cmd: ["tail", "-f", "/dev/null"],   // keeps container running infinitely
            HostConfig: {
                Binds: [`${workspacePath}:/workspace`],        // mount workspace path
                Memory: 512 * 1024 * 1024,  // 512MB RAM
                NanoCpus: 1000000000, // 1 CPU core
            },
            WorkingDir: "/workspace"
        });

        await container.start();
        console.log(`[SANDBOX] Started for session:${sessionId}`);
        return container
    }
    catch (err: any) {
        // return container if already exist
        if (err.statusCode === 409) return docker.getContainer(containerName)
        throw err;
    }
}

export async function destroySandox(sessionId: string) {
    const container = docker.getContainer(`agentos-sandbox-${sessionId}`);
    try {
        await container.stop();
        await container.remove();
        console.log(`[Sandbox] Destryed for session ${sessionId}`)
    }
    catch (err) {
        // ignore 
    }
}