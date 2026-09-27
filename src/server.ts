import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { getTermRefs, getTermRendering, resolveBiblicalTermsPath, searchTerms } from "./biblicalTerms.js"
import { getInterlinear, listInterlinearLanguages } from "./interlinear.js"
import { getScripture, listAvailableBooks, listAvailableProjects } from "./scripture.js"

export function createServer(projectsRoot: string): McpServer {
    const server = new McpServer({
        name: "ptx-mcp",
        version: "0.3.0"
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

    server.registerTool(
        "list-it",
        {
            title: "List interlinear gloss languages",
            description:
                "List the gloss language codes (e.g. en, en-US) that have interlinear data in a Paratext project. " +
                "If a book is given, only languages with interlinear data for that book are listed.",
            inputSchema: {
                project: z.string().describe("Paratext project id (folder name)"),
                book: z.string().length(3).optional().describe("3-letter USFM book code, e.g. GEN, MAT, 1CO")
            }
        },
        async ({ project, book }) => {
            const languages = listInterlinearLanguages(projectsRoot, project, book)
            return { content: [{ type: "text", text: languages.join("\n") }] }
        }
    )

    server.registerTool(
        "get-it",
        {
            title: "Get interlinear text",
            description:
                "Get interlinear glosses for verses in a Paratext project: each word of the verse text paired with " +
                "its gloss in the given language. Specify verses either with book plus optional chapter/verse range " +
                "(same as get-scripture) or with refs, a semicolon-separated list such as 'ROM 1:1; 3:5-7; MAT 5'. " +
                "Returns JSON: [{\"ref\":\"ROM 1:1\",\"words\":[[\"Kɨ\",\"I\"],...]},...]. " +
                "Every word of the verse text is returned. The gloss is the one approved for that word in the verse, " +
                "otherwise the word's most common gloss elsewhere, otherwise the first gloss of a matching lexicon entry, " +
                "otherwise '_'. With showSource, each word gets a third element: 'a' approved in this verse, " +
                "'g' guessed from other verses, 'l' from the lexicon, '-' never glossed.",
            inputSchema: {
                project: z.string().describe("Paratext project id (folder name)"),
                language: z.string().describe("Gloss language code, e.g. en (see list-it)"),
                book: z.string().length(3).optional().describe("3-letter USFM book code (omit when using refs)"),
                startChapter: z.number().int().positive().optional().describe("Starting chapter (omit for the whole book)"),
                startVerse: z.number().int().positive().optional().describe("Starting verse (omit for the whole chapter)"),
                endChapter: z.number().int().positive().optional().describe("Ending chapter (defaults to startChapter)"),
                endVerse: z.number().int().positive().optional().describe("Ending verse (defaults to the last verse of endChapter)"),
                refs: z
                    .string()
                    .optional()
                    .describe(
                        "Semicolon-separated references instead of book/chapter/verse, e.g. 'ROM 1:1; 3:5-7; 1:30-2:2; MAT 5'. " +
                        "Refs without a book reuse the previous ref's book."
                    ),
                allowPartial: z
                    .boolean()
                    .optional()
                    .describe("If true, omit missing verses/books and return '_' glosses for a missing gloss language instead of raising an error"),
                showSource: z
                    .boolean()
                    .optional()
                    .describe("If true, add a third element to each word: 'a' approved, 'g' guessed, 'l' lexicon, '-' never glossed")
            }
        },
        async ({ project, language, book, startChapter, startVerse, endChapter, endVerse, refs, allowPartial, showSource }) => {
            const result = getInterlinear({
                projectsRoot,
                project,
                language,
                book,
                startChapter,
                startVerse,
                endChapter,
                endVerse,
                refs,
                allowPartial,
                showSource
            })
            const content = [{ type: "text" as const, text: JSON.stringify(result.verses) }]
            if (result.missing.length > 0) {
                content.push({ type: "text" as const, text: `[missing: ${result.missing.join("; ")}]` })
            }
            return { content }
        }
    )

    server.registerTool(
        "list-bt",
        {
            title: "Search Biblical Terms",
            description:
                "Search Paratext's Biblical Terms list (Hebrew, Aramaic and Greek terms). Matches the search string " +
                "anywhere in a term's English gloss, original-language lemma (id), transliteration or definition, " +
                "ignoring case and diacritics, or exactly matches a Strong's number (e.g. G2098). " +
                "Returns JSON: [{id, gloss, transliteration, language, category, strong, refCount}, ...]. " +
                "Use the id with get-bt-refs.",
            inputSchema: {
                search: z.string().describe("Text to search for, e.g. 'gospel', 'euangelion', or 'G2098'"),
                book: z.string().length(3).optional().describe("Only terms that occur in this 3-letter USFM book code")
            }
        },
        async ({ search, book }) => {
            const terms = searchTerms(resolveBiblicalTermsPath(), search, book)
            return { content: [{ type: "text", text: JSON.stringify(terms) }] }
        }
    )

    server.registerTool(
        "get-bt-refs",
        {
            title: "Get Biblical Term references",
            description:
                "Get the verses where a Biblical Term occurs, as a semicolon-separated reference string " +
                "(e.g. 'ROM 1:1; 1:9; 1CO 9:14') that can be passed as refs to get-it. " +
                "Optionally restrict to a book/chapter/verse range or to refs. References use original-language " +
                "(Hebrew/Greek) versification.",
            inputSchema: {
                id: z.string().describe("Term id (original-language lemma, incl. any -N suffix) from list-bt"),
                book: z.string().length(3).optional().describe("Only refs in this 3-letter USFM book code"),
                startChapter: z.number().int().positive().optional().describe("Starting chapter (omit for the whole book)"),
                startVerse: z.number().int().positive().optional().describe("Starting verse (omit for the whole chapter)"),
                endChapter: z.number().int().positive().optional().describe("Ending chapter (defaults to startChapter)"),
                endVerse: z.number().int().positive().optional().describe("Ending verse (defaults to the end of endChapter)"),
                refs: z
                    .string()
                    .optional()
                    .describe("Only refs inside these semicolon-separated ranges, e.g. 'ROM 1; 2; MAT 5:1-12'")
            }
        },
        async ({ id, book, startChapter, startVerse, endChapter, endVerse, refs }) => {
            const text = getTermRefs({
                termsPath: resolveBiblicalTermsPath(),
                id,
                book,
                startChapter,
                startVerse,
                endChapter,
                endVerse,
                refs
            })
            return { content: [{ type: "text", text }] }
        }
    )

    server.registerTool(
        "get-rendering",
        {
            title: "Get Biblical Term rendering",
            description:
                "Get how a Paratext project renders a Biblical Term, from the project's TermRenderings.xml. " +
                "Returns the renderings exactly as stored, e.g. 'Akam* Aghuuŋ*': '*' is a wildcard matching any " +
                "word ending/beginning, '||' separates alternative renderings. Empty if the term has no renderings yet.",
            inputSchema: {
                project: z.string().describe("Paratext project id (folder name)"),
                id: z.string().describe("Term id (original-language lemma, incl. any -N suffix) from list-bt")
            }
        },
        async ({ project, id }) => {
            const text = getTermRendering(projectsRoot, project, id)
            return { content: [{ type: "text", text }] }
        }
    )

    return server
}
