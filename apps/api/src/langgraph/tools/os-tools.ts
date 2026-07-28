import { tool } from "@langchain/core/tools";
import z from "zod";
import { createSandbox } from "../../sandbox";
import { withResilience } from "../../resilience";
import Docker from "dockerode"
import { sendSSE, streamRegistry } from "../../router/chat";

const docker = new Docker();

async function executeCode(code: string, sessionId: string, language: 'python' | 'sh' = 'python') {
    const container = docker.getContainer(`agentos-sandbox-${sessionId}`);

    const cmd = language === "python" ? ['python', "-c", code] : ["sh", "-c", code]

    const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true
    })

    const stream = await exec.start({ Detach: false })

    return new Promise<string>((resolve: any) => {

        let output = "";
        const res = streamRegistry.get(sessionId)

        stream.on("data", (chunk) => {
            const text = chunk.toString('utf8');
            output += text
            sendSSE(res, 'workspace', { text })
        })


        stream.on("end", () => resolve(output))
    })
}

const resilientExec = withResilience("DockerExec", executeCode, {
    timeout: 15000, // 15s
    capacity: 2
})


export const codeExecTool = tool(async ({ code, sessionId, language }) => {

    try {
        await createSandbox(sessionId)
        const result = await resilientExec(sessionId, code, language);
        return result || "Execution Completed with No Output"
    }
    catch (e: any) {
        return `Execution failed:${e.message} `
    }

}, {
    name: 'execute_code',
    description: `Write and execute python shell script in secure sandbox, Use this to do math , process data or scrape websites`,
    schema: z.object({
        sessionId: z.string(),
        code: z.string(),
        language: z.enum(["python", "sh"])
    })
})
