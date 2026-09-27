import fs from "node:fs"
import path from "node:path"
import { bookCodeFromNumber, bookNumberFromCode, isBookCode } from "./books.js"
import { getProjectDir } from "./discovery.js"
import { BookSpan, parseRefs, Span } from "./interlinear.js"
import { InvalidReferenceError } from "./scripture.js"

// Biblical Terms list layout is documented in src/md/bt/bt_spec.md.

export class BiblicalTermsNotFoundError extends Error {
    constructor(triedPaths: string[]) {
        super(`Biblical Terms list not found. Tried: ${triedPaths.join("; ")}`)
        this.name = "BiblicalTermsNotFoundError"
    }
}

export class TermNotFoundError extends Error {
    constructor(id: string) {
        super(`Biblical term not found: ${id}`)
        this.name = "TermNotFoundError"
    }
}

interface VerseRef {
    bookNumber: number
    chapter: number
    verse: number
}

interface Term {
    id: string
    strong: string[]
    transliteration: string
    category: string
    language: string
    definition: string
    gloss: string
    // Unique verses in canonical order; word positions dropped.
    verses: VerseRef[]
    // Normalized text of searchable fields.
    searchText: string[]
}

export interface TermSummary {
    id: string
    gloss: string
    transliteration: string
    language: string
    category: string
    strong: string[]
    refCount: number
}

export interface TermRefsRequest {
    termsPath: string
    id: string
    book?: string
    startChapter?: number
    startVerse?: number
    endChapter?: number
    endVerse?: number
    refs?: string
}

const TERMS_FILE = "BiblicalTerms.xml"

// Default locations of the Biblical Terms list: Paratext install dirs, then this repo's copy.
export const DEFAULT_TERMS_PATHS = [
    "C:\\Program Files (x86)\\Paratext 9\\Terms\\Lists\\" + TERMS_FILE,
    "C:\\Program Files\\Paratext 9\\Terms\\Lists\\" + TERMS_FILE,
    path.join(import.meta.dirname, "..", "myParatext", "Lists", TERMS_FILE)
]

export function resolveBiblicalTermsPath(candidates: string[] = DEFAULT_TERMS_PATHS): string {
    const found = candidates.find((candidate) => fs.existsSync(candidate))
    if (!found) throw new BiblicalTermsNotFoundError(candidates)
    return found
}

// ---------- parsing ----------

function decodeXml(value: string): string {
    return value
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
}

// Lowercase and strip diacritics (incl. Greek accents and Hebrew points).
function normalizeSearch(value: string): string {
    return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

function element(body: string, name: string): string {
    const match = body.match(new RegExp(`<${name}>([^<]*)</${name}>`))
    return match ? decodeXml(match[1]).trim() : ""
}

function parseVerseRefs(body: string): VerseRef[] {
    const unique = new Map<string, VerseRef>()
    for (const match of body.matchAll(/<Verse>\s*(\d{9})\d{5}[^<]*<\/Verse>/g)) {
        // BBBCCCVVV + 5-digit word position (dropped); rare suffixes like "{N:001}" ignored.
        const digits = match[1]
        if (unique.has(digits)) continue
        unique.set(digits, {
            bookNumber: parseInt(digits.slice(0, 3), 10),
            chapter: parseInt(digits.slice(3, 6), 10),
            verse: parseInt(digits.slice(6, 9), 10)
        })
    }
    return [...unique.values()].sort(compareVerseRefs)
}

function compareVerseRefs(a: VerseRef, b: VerseRef): number {
    return a.bookNumber - b.bookNumber || a.chapter - b.chapter || a.verse - b.verse
}

function parseTerms(xml: string): Term[] {
    const terms: Term[] = []
    for (const match of xml.matchAll(/<Term\s+Id="([^"]*)"\s*>([\s\S]*?)<\/Term>/g)) {
        const id = decodeXml(match[1])
        const body = match[2]
        const strong = element(body, "Strong")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        const transliteration = element(body, "Transliteration")
        const definition = element(body, "Definition")
        const gloss = element(body, "Gloss")
        terms.push({
            id,
            strong,
            transliteration,
            category: element(body, "Category"),
            language: element(body, "Language"),
            definition,
            gloss,
            verses: parseVerseRefs(body),
            searchText: [gloss, id, transliteration, definition].map(normalizeSearch)
        })
    }
    return terms
}

interface TermsIndex {
    terms: Term[]
    byId: Map<string, Term>
}

const termsCache = new Map<string, { mtimeMs: number; value: TermsIndex }>()

function loadTerms(termsPath: string): TermsIndex {
    const mtimeMs = fs.statSync(termsPath).mtimeMs
    const cached = termsCache.get(termsPath)
    if (cached && cached.mtimeMs === mtimeMs) return cached.value

    const terms = parseTerms(fs.readFileSync(termsPath, "utf8"))
    // Ids in the file are not NFC-normalized; index by NFC so client-supplied Ids match.
    const byId = new Map(terms.map((term) => [term.id.normalize("NFC"), term]))
    const value = { terms, byId }
    termsCache.set(termsPath, { mtimeMs, value })
    return value
}

// ---------- filtering ----------

function toBookNumber(book: string): number {
    const code = book.toUpperCase()
    const bookNumber = isBookCode(code) ? bookNumberFromCode(code) : undefined
    if (bookNumber === undefined) throw new InvalidReferenceError(`Not a valid USFM book code: ${book}`)
    return bookNumber
}

// A span with get-scripture defaults, but unbounded ends (no USFM needed).
function inSpan(ref: VerseRef, bookNumber: number, span: Span): boolean {
    if (ref.bookNumber !== bookNumber) return false
    if (span.startChapter === undefined) return true

    const startChapter = span.startChapter
    const endChapter = span.endChapter ?? startChapter
    if (endChapter < startChapter) {
        throw new InvalidReferenceError(`End chapter ${endChapter} is before start chapter ${startChapter}`)
    }
    const startVerse = span.startVerse ?? 1
    const endVerse = span.endVerse ?? Number.POSITIVE_INFINITY

    const afterStart = ref.chapter > startChapter || (ref.chapter === startChapter && ref.verse >= startVerse)
    const beforeEnd = ref.chapter < endChapter || (ref.chapter === endChapter && ref.verse <= endVerse)
    return afterStart && beforeEnd
}

function formatRefs(verses: VerseRef[]): string {
    const parts: string[] = []
    let previousBook: string | undefined
    for (const ref of verses) {
        const book = bookCodeFromNumber(ref.bookNumber)
        if (!book) continue
        const prefix = book === previousBook ? "" : `${book} `
        parts.push(`${prefix}${ref.chapter}:${ref.verse}`)
        previousBook = book
    }
    return parts.join("; ")
}

// ---------- project TermRenderings.xml ----------

export class TermRenderingsNotFoundError extends Error {
    constructor(projectId: string) {
        super(`No TermRenderings.xml in project ${projectId}`)
        this.name = "TermRenderingsNotFoundError"
    }
}

export interface TermRendering {
    // Raw <Renderings> text, e.g. "Akam* Aghuuŋ*"; "" if none.
    renderings: string
    // Verses where a match was denied (marked as not a rendering), e.g. "MRK 1:1; LUK 2:3"; "" if none.
    denials: string
    // Free-text <Notes>, may span several lines ("\n"); "" if none.
    notes: string
}

interface ParsedTermRendering {
    renderings: string
    denials: VerseRef[]
    notes: string
}

const renderingsCache = new Map<string, { mtimeMs: number; value: Map<string, ParsedTermRendering> }>()

// <Denial> is a BBBCCCVVV verse number with leading zeros dropped, e.g. 41001001 = MRK 1:1.
function parseDenials(body: string): VerseRef[] {
    const unique = new Map<number, VerseRef>()
    for (const match of body.matchAll(/<Denial>\s*(\d+)\s*<\/Denial>/g)) {
        const value = parseInt(match[1], 10)
        unique.set(value, {
            bookNumber: Math.floor(value / 1_000_000),
            chapter: Math.floor(value / 1000) % 1000,
            verse: value % 1000
        })
    }
    return [...unique.values()].sort(compareVerseRefs)
}

// NFC term Id -> renderings and denials.
function parseTermRenderings(xml: string): Map<string, ParsedTermRendering> {
    const renderings = new Map<string, ParsedTermRendering>()
    const termPattern = /<TermRendering\s+Id="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/TermRendering>)/g
    for (const match of xml.matchAll(termPattern)) {
        const id = decodeXml(match[1]).normalize("NFC")
        const body = match[2] ?? ""
        const value = body.match(/<Renderings>([^<]*)<\/Renderings>/)
        const notes = body.match(/<Notes>([^<]*)<\/Notes>/)
        renderings.set(id, {
            renderings: value ? decodeXml(value[1]) : "",
            denials: parseDenials(body),
            notes: notes ? decodeXml(notes[1]).replace(/\r\n?/g, "\n") : ""
        })
    }
    return renderings
}

function loadTermRenderings(projectDir: string, projectId: string): Map<string, ParsedTermRendering> {
    const filePath = path.join(projectDir, "TermRenderings.xml")
    if (!fs.existsSync(filePath)) throw new TermRenderingsNotFoundError(projectId)
    const mtimeMs = fs.statSync(filePath).mtimeMs
    const cached = renderingsCache.get(filePath)
    if (cached && cached.mtimeMs === mtimeMs) return cached.value
    const value = parseTermRenderings(fs.readFileSync(filePath, "utf8"))
    renderingsCache.set(filePath, { mtimeMs, value })
    return value
}

// ---------- public API ----------

export function searchTerms(termsPath: string, search: string, book?: string): TermSummary[] {
    const query = normalizeSearch(search.trim())
    if (query.length === 0) throw new InvalidReferenceError("Search string must not be empty")
    const bookNumber = book === undefined ? undefined : toBookNumber(book)
    const strongQuery = search.trim().toUpperCase()

    return loadTerms(termsPath).terms
        .filter((term) =>
            term.searchText.some((text) => text.includes(query))
            || term.strong.some((s) => s.toUpperCase() === strongQuery)
        )
        .filter((term) => bookNumber === undefined || term.verses.some((v) => v.bookNumber === bookNumber))
        .map((term) => ({
            id: term.id,
            gloss: term.gloss,
            transliteration: term.transliteration,
            language: term.language,
            category: term.category,
            strong: term.strong,
            refCount: term.verses.length
        }))
}

export function getTermRefs(request: TermRefsRequest): string {
    const term = loadTerms(request.termsPath).byId.get(request.id.trim().normalize("NFC"))
    if (!term) throw new TermNotFoundError(request.id)

    const hasStructured = request.book !== undefined
        || request.startChapter !== undefined
        || request.startVerse !== undefined
        || request.endChapter !== undefined
        || request.endVerse !== undefined
    const hasRefs = request.refs !== undefined
    if (hasStructured && hasRefs) {
        throw new InvalidReferenceError("Specify either refs or book/chapter/verse, not both")
    }

    let spans: BookSpan[] | undefined
    if (hasRefs) {
        spans = parseRefs(request.refs ?? "")
    } else if (hasStructured) {
        if (request.book === undefined) throw new InvalidReferenceError("book is required with chapter/verse")
        const { startChapter, startVerse, endChapter, endVerse } = request
        spans = [{ book: request.book, span: { startChapter, startVerse, endChapter, endVerse } }]
    }

    const filters = spans?.map(({ book, span }) => ({ bookNumber: toBookNumber(book), span }))
    const verses = filters
        ? term.verses.filter((ref) => filters.some((f) => inSpan(ref, f.bookNumber, f.span)))
        : term.verses
    return formatRefs(verses)
}

// The project's renderings of a term, exactly as stored in TermRenderings.xml
// ("*" is a wildcard, "||" separates alternatives), plus its denied verses as a refs string
// and its notes.
export function getTermRendering(projectsRoot: string, projectId: string, id: string): TermRendering {
    const projectDir = getProjectDir(projectsRoot, projectId)
    const rendering = loadTermRenderings(projectDir, projectId).get(id.trim().normalize("NFC"))
    if (rendering === undefined) throw new TermNotFoundError(id)
    return { renderings: rendering.renderings, denials: formatRefs(rendering.denials), notes: rendering.notes }
}
