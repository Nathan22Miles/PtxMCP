#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { resolveProjectsRoot } from "./discovery.js"
import { createServer } from "./server.js"

async function main() {
    const cliArg = process.argv[2]
    const projectsRoot = resolveProjectsRoot(cliArg)

    const paratextInstallDir = process.argv[3]

    const server = createServer(projectsRoot, paratextInstallDir)
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
})
