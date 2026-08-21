import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { getScripture, listAvailableBooks, listAvailableProjects } from "./scripture.js"

export function createServer(projectsRoot: string): McpServer {
    const server = new McpServer({
        name: "ptx-mcp",
        version: "0.1.0"
    })

    server.registerTool(
        "list-projects",
        {
            title: "List Paratext projects",
            description: "List the Paratext project ids available under the configured projects folder.",
            inputSchema: {}
        },
        async () => {
            const projects = listAvailableProjects(projectsRoot)
            return { content: [{ type: "text", text: projects.join("\n") }] }
        }
    )

    server.registerTool(
        "list-books",
        {
            title: "List books in a Paratext project",
            description: "List the 3-letter USFM book codes present in a Paratext project.",
            inputSchema: {
                project: z.string().describe("Paratext project id (folder name)")
            }
        },
        async ({ project }) => {
            const books = listAvailableBooks(projectsRoot, project)
            return { content: [{ type: "text", text: books.join("\n") }] }
        }
    )

    server.registerTool(
        "get-scripture",
        {
            title: "Get scripture text",
            description:
                "Get verse text for a book, chapter, or verse range from one or more Paratext projects. " +
                "Returns plain verse text only (no headings, footnotes, or cross-references), one verse per line " +
                "formatted as 'BOOK CHAPTER:VERSE text'. When multiple projects are requested, each line is " +
                "prefixed with the project id and verses are interleaved across projects.",
            inputSchema: {
                projects: z
                    .array(z.string())
                    .min(1)
                    .describe("One or more Paratext project ids (folder names) to fetch text from"),
                book: z.string().length(3).describe("3-letter USFM book code, e.g. GEN, MAT, 1CO"),
                startChapter: z.number().int().positive().optional().describe("Starting chapter (omit for the whole book)"),
                startVerse: z.number().int().positive().optional().describe("Starting verse (omit for the whole chapter)"),
                endChapter: z.number().int().positive().optional().describe("Ending chapter (defaults to startChapter)"),
                endVerse: z.number().int().positive().optional().describe("Ending verse (defaults to the last verse of endChapter)"),
                allowPartial: z
                    .boolean()
                    .optional()
                    .describe("If true, silently omit missing projects/books/verses instead of raising an error")
            }
        },
        async ({ projects, book, startChapter, startVerse, endChapter, endVerse, allowPartial }) => {
            const result = getScripture({
                projectsRoot,
                projects,
                book,
                startChapter,
                startVerse,
                endChapter,
                endVerse,
                allowPartial
            })
            const text = result.missing.length > 0
                ? `${result.text}\n\n[missing: ${result.missing.join("; ")}]`
                : result.text
            return { content: [{ type: "text", text }] }
        }
    )

    return server
}
