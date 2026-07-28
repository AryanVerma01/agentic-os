import { tool } from "@langchain/core/tools"
import path from "path"
import fs from "fs"
import z from "zod"

export const fileSystemTool = tool(async ({ action, filename, content, sessionId }) => {

    const safefilename = path.basename(filename)
    const filePath = path.join(process.cwd(), ".workspace", sessionId, safefilename)

    try {
        if (action === "read") {
            return fs.readFileSync(filePath, "utf-8")
        }
        else {
            fs.writeFileSync(filePath, content || "")
            return `File ${safefilename} saved successfully`
        }
    }
    catch (err: any) {
        return `File Operation Failed`
    }
}, {
    name: 'manage_files',
    description: 'read or write files to agent workspace',
    schema: z.object({
        filename: z.string(),
        content: z.string(),
        action: z.enum(["read", "write"]),
        sessionId: z.string()
    })
})