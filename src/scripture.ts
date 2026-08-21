import { BOOK_CODES, isBookCode } from "./books.js"
import { getProjectDir, listProjects, ProjectNotFoundError } from "./discovery.js"
import { indexProjectBooks, parseBookFile, ParsedBook } from "./usfmBook.js"

export class InvalidReferenceError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InvalidReferenceError"
    }
}

export class BookNotFoundError extends Error {
    constructor(projectId: string, book: string) {
        super(`Book ${book} not found in project ${projectId}`)
        this.name = "BookNotFoundError"
    }
}

export class VerseNotFoundError extends Error {
    constructor(ref: string) {
        super(`Verse not found: ${ref}`)
        this.name = "VerseNotFoundError"
    }
}

export interface ScriptureRequest {
    projectsRoot: string
    projects: string[]
    book: string
    startChapter?: number
    startVerse?: number
    endChapter?: number
    endVerse?: number
    allowPartial?: boolean
}

export interface ScriptureResult {
    text: string
    missing: string[]
}

const bookCache = new Map<string, ParsedBook>()

function loadBook(projectDir: string, projectId: string, book: string): ParsedBook {
    const cacheKey = `${projectDir}::${book}`
    const cached = bookCache.get(cacheKey)
    if (cached) return cached

    const index = indexProjectBooks(projectDir)
    const filePath = index.get(book)
    if (!filePath) throw new BookNotFoundError(projectId, book)

    const parsed = parseBookFile(filePath)
    bookCache.set(cacheKey, parsed)
    return parsed
}

function maxVerseNumber(chapterVerses: { end: number }[] | undefined): number {
    if (!chapterVerses || chapterVerses.length === 0) return 0
    return Math.max(...chapterVerses.map((v) => v.end))
}

export function getScripture(request: ScriptureRequest): ScriptureResult {
    const book = request.book.toUpperCase()
    if (!isBookCode(book)) {
        throw new InvalidReferenceError(`Not a valid USFM book code: ${request.book}`)
    }
    if (request.projects.length === 0) {
        throw new InvalidReferenceError("At least one project must be specified")
    }
    const allowPartial = request.allowPartial ?? false
    const missing: string[] = []

    const parsedByProject = new Map<string, ParsedBook>()
    for (const projectId of request.projects) {
        try {
            const projectDir = getProjectDir(request.projectsRoot, projectId)
            const parsed = loadBook(projectDir, projectId, book)
            parsedByProject.set(projectId, parsed)
        } catch (err) {
            if (err instanceof ProjectNotFoundError || err instanceof BookNotFoundError) {
                if (!allowPartial) throw err
                missing.push(err.message)
                continue
            }
            throw err
        }
    }

    if (parsedByProject.size === 0) {
        throw new VerseNotFoundError(`${book} in project(s) ${request.projects.join(", ")}`)
    }

    // Union of chapter numbers across resolved projects, used when the caller
    // doesn't pin down an explicit chapter/verse range.
    const allChapterNumbers = new Set<number>()
    for (const parsed of parsedByProject.values()) {
        for (const chapterNum of parsed.chapters.keys()) allChapterNumbers.add(chapterNum)
    }
    const sortedChapters = [...allChapterNumbers].sort((a, b) => a - b)

    const startChapter = request.startChapter ?? sortedChapters[0] ?? 1
    const endChapter = request.endChapter ?? request.startChapter ?? sortedChapters[sortedChapters.length - 1] ?? startChapter

    const multiProject = request.projects.length > 1
    const blocks: string[] = []

    for (let chapter = startChapter; chapter <= endChapter; chapter++) {
        const isFirstChapter = chapter === startChapter
        const isLastChapter = chapter === endChapter

        const chapterVerseUnion = maxVerseNumber(
            [...parsedByProject.values()].flatMap((p) => p.chapters.get(chapter) ?? [])
        )

        const verseStart = isFirstChapter && request.startVerse ? request.startVerse : 1
        const verseEnd = isLastChapter && request.endVerse ? request.endVerse : chapterVerseUnion

        const lastLabelByProject = new Map<string, string | null>()

        for (let verse = verseStart; verse <= verseEnd; verse++) {
            const groupLines: string[] = []
            for (const projectId of request.projects) {
                const parsed = parsedByProject.get(projectId)
                const ref = `${projectId} ${book} ${chapter}:${verse}`
                if (!parsed) continue // already recorded as missing above

                const verses = parsed.chapters.get(chapter) ?? []
                const entry = verses.find((v) => verse >= v.start && verse <= v.end)

                if (!entry) {
                    if (allowPartial) {
                        missing.push(ref)
                        continue
                    }
                    throw new VerseNotFoundError(ref)
                }

                if (lastLabelByProject.get(projectId) === entry.label) continue
                lastLabelByProject.set(projectId, entry.label)

                const prefix = multiProject ? `${projectId} ` : ""
                groupLines.push(`${prefix}${book} ${chapter}:${entry.label} ${entry.text}`)
            }
            if (groupLines.length > 0) blocks.push(groupLines.join("\n"))
        }
    }

    const separator = multiProject ? "\n\n" : "\n"
    return { text: blocks.join(separator), missing }
}

export function listAvailableProjects(projectsRoot: string): string[] {
    return listProjects(projectsRoot)
}

export function listAvailableBooks(projectsRoot: string, projectId: string): string[] {
    const projectDir = getProjectDir(projectsRoot, projectId)
    const present = indexProjectBooks(projectDir)
    return BOOK_CODES.filter((code) => present.has(code))
}
