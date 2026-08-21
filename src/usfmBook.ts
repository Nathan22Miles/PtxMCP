import fs from "node:fs"
import path from "node:path"
// usfm-js has no type definitions; consume it as untyped JS.
// @ts-expect-error - no types published for usfm-js
import usfm from "usfm-js"

export interface ParsedVerse {
    start: number
    end: number
    label: string
    text: string
}

export interface ParsedBook {
    code: string
    chapters: Map<number, ParsedVerse[]>
}

interface UsfmNode {
    type?: string
    tag?: string
    text?: string
    children?: UsfmNode[]
}

function collectText(nodes: UsfmNode[] | undefined): string {
    if (!nodes) return ""
    let out = ""
    for (const node of nodes) {
        if (!node) continue
        if (node.type === "footnote" || node.tag === "f") continue
        if (typeof node.text === "string") {
            out += node.text
        }
        if (Array.isArray(node.children)) {
            out += collectText(node.children)
        }
    }
    return out
}

function normalizeText(raw: string): string {
    return raw.replace(/\s+/g, " ").trim()
}

function parseVerseLabel(label: string): { start: number; end: number } {
    const [startStr, endStr] = label.split("-")
    const start = parseInt(startStr, 10)
    const end = endStr ? parseInt(endStr, 10) : start
    return { start, end }
}

export function bookCodeFromFile(filePath: string): string | undefined {
    const contents = fs.readFileSync(filePath, "utf8")
    const match = contents.match(/\\id\s+([A-Za-z0-9]{3})/)
    return match ? match[1].toUpperCase() : undefined
}

export function indexProjectBooks(projectDir: string): Map<string, string> {
    const index = new Map<string, string>()
    const files = fs.readdirSync(projectDir).filter((f) => f.toUpperCase().endsWith(".SFM"))
    for (const file of files) {
        const filePath = path.join(projectDir, file)
        const code = bookCodeFromFile(filePath)
        if (code) index.set(code, filePath)
    }
    return index
}

export function parseBookFile(filePath: string): ParsedBook {
    const contents = fs.readFileSync(filePath, "utf8")
    const json = usfm.toJSON(contents) as {
        headers: Array<{ tag: string; content?: string }>
        chapters: Record<string, Record<string, { verseObjects: UsfmNode[] }>>
    }

    const idHeader = json.headers.find((h) => h.tag === "id")
    const code = (idHeader?.content ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? ""

    const chapters = new Map<number, ParsedVerse[]>()
    for (const [chapterKey, verses] of Object.entries(json.chapters)) {
        if (chapterKey === "front") continue
        const chapterNum = parseInt(chapterKey, 10)
        const parsedVerses: ParsedVerse[] = []
        for (const [verseKey, verseData] of Object.entries(verses)) {
            if (verseKey === "front") continue
            const { start, end } = parseVerseLabel(verseKey)
            const text = normalizeText(collectText(verseData.verseObjects))
            if (!text) continue
            parsedVerses.push({ start, end, label: verseKey, text })
        }
        parsedVerses.sort((a, b) => a.start - b.start)
        chapters.set(chapterNum, parsedVerses)
    }

    return { code, chapters }
}
