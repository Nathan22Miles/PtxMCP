import fs from "node:fs"
import path from "node:path"
import { isBookCode } from "./books.js"
import { getProjectDir } from "./discovery.js"
import { BookNotFoundError, InvalidReferenceError, loadBook, VerseNotFoundError } from "./scripture.js"
import { indexProjectBooks, ParsedBook } from "./usfmBook.js"

// Interlinear data layout is documented in src/md/it/it_spec.md.

export class InterlinearNotFoundError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InterlinearNotFoundError"
    }
}

export type WordGloss = [string, string | null]

export interface InterlinearVerse {
    ref: string
    words: WordGloss[]
}

export interface InterlinearRequest {
    projectsRoot: string
    project: string
    language: string
    book?: string
    startChapter?: number
    startVerse?: number
    endChapter?: number
    endVerse?: number
    refs?: string
    allowPartial?: boolean
}

export interface InterlinearResult {
    verses: InterlinearVerse[]
    missing: string[]
}

export interface Span {
    startChapter?: number
    startVerse?: number
    endChapter?: number
    endVerse?: number
}

export interface BookSpan {
    book: string
    span: Span
}

interface VerseTarget {
    book: string
    chapter: number
    label: string
    start: number
    end: number
}

interface LexemeRef {
    type: string
    form: string
    glossId?: string
}

interface Cluster {
    index: number
    length: number
    lexemes: LexemeRef[]
    excluded: boolean
}

interface InterlinearItem {
    chapter: number
    label: string
    start: number
    end: number
    clusters: Cluster[]
}

interface InterlinearBook {
    // key: "C:label", e.g. "1:9-10"
    items: Map<string, InterlinearItem>
    byChapter: Map<number, InterlinearItem[]>
}

interface Lexicon {
    // key: "Type:form#senseId"
    byLexemeSense: Map<string, string>
    // senseId -> gloss, only for sense ids used by a single lexeme
    bySense: Map<string, string>
}

const LANGUAGE_PATTERN = /^[A-Za-z0-9_-]+$/
const INTERLINEAR_DIR_PREFIX = "Interlinear_"

// ---------- small helpers ----------

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

function attr(tag: string, name: string): string | undefined {
    const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
    return match ? decodeXml(match[1]) : undefined
}

function normalizeForm(value: string): string {
    return value.normalize("NFC").toLowerCase()
}

function parseVerseRange(label: string): { start: number; end: number } | undefined {
    const match = label.match(/^(\d+)(?:-(\d+))?$/)
    if (!match) return undefined
    const start = parseInt(match[1], 10)
    const end = match[2] ? parseInt(match[2], 10) : start
    return { start, end }
}

// Cache parsed files, keyed by path; re-parse when the file changes on disk.
function cachedByMtime<T>(cache: Map<string, { mtimeMs: number; value: T }>, filePath: string, parse: () => T): T {
    const mtimeMs = fs.statSync(filePath).mtimeMs
    const cached = cache.get(filePath)
    if (cached && cached.mtimeMs === mtimeMs) return cached.value
    const value = parse()
    cache.set(filePath, { mtimeMs, value })
    return value
}

// ---------- lexicon.xml ----------

const lexiconCache = new Map<string, { mtimeMs: number; value: Lexicon }>()

function parseLexicon(xml: string): Lexicon {
    const byLexemeSense = new Map<string, string>()
    const senseGloss = new Map<string, string>()
    const senseCount = new Map<string, number>()

    const itemPattern = /<Lexeme\b([^>]*)\/>([\s\S]*?)<\/item>/g
    const sensePattern = /<Sense\b([^>]*)>\s*<Gloss\b([^>]*?)(?:\/>|>([^<]*)<\/Gloss>)/g
    for (const item of xml.matchAll(itemPattern)) {
        const type = attr(item[1], "Type")
        const form = attr(item[1], "Form")
        if (!type || form === undefined) continue
        for (const sense of item[2].matchAll(sensePattern)) {
            const senseId = attr(sense[1], "Id")
            if (!senseId) continue
            const gloss = decodeXml(sense[3] ?? "")
            byLexemeSense.set(`${type}:${form}#${senseId}`, gloss)
            senseGloss.set(senseId, gloss)
            senseCount.set(senseId, (senseCount.get(senseId) ?? 0) + 1)
        }
    }

    const bySense = new Map<string, string>()
    for (const [senseId, gloss] of senseGloss) {
        if (senseCount.get(senseId) === 1) bySense.set(senseId, gloss)
    }
    return { byLexemeSense, bySense }
}

function loadLexicon(projectDir: string): Lexicon {
    const filePath = path.join(projectDir, "lexicon.xml")
    if (!fs.existsSync(filePath)) return { byLexemeSense: new Map(), bySense: new Map() }
    return cachedByMtime(lexiconCache, filePath, () => parseLexicon(fs.readFileSync(filePath, "utf8")))
}

function lookupGloss(lexicon: Lexicon, lexeme: LexemeRef): string | null {
    if (!lexeme.glossId) return null
    return lexicon.byLexemeSense.get(`${lexeme.type}:${lexeme.form}#${lexeme.glossId}`)
        ?? lexicon.bySense.get(lexeme.glossId)
        ?? null
}

// ---------- Interlinear_<lang>_<BOOK>.xml ----------

const interlinearCache = new Map<string, { mtimeMs: number; value: InterlinearBook }>()

function parseInterlinear(xml: string): InterlinearBook {
    const items = new Map<string, InterlinearItem>()
    const byChapter = new Map<number, InterlinearItem[]>()

    const itemPattern = /<item>\s*<string>([^<]*)<\/string>([\s\S]*?)<\/item>/g
    const clusterPattern = /<Cluster>([\s\S]*?)<\/Cluster>/g
    const lexemePattern = /<Lexeme\b([^>]*)\/>/g
    for (const item of xml.matchAll(itemPattern)) {
        // "ROM 1:1" or "ROM 1:9-10"
        const refMatch = decodeXml(item[1]).trim().match(/^\S+\s+(\d+):(\S+)$/)
        if (!refMatch) continue
        const chapter = parseInt(refMatch[1], 10)
        const label = refMatch[2]
        const range = parseVerseRange(label)
        if (!range) continue

        const clusters: Cluster[] = []
        for (const cluster of item[2].matchAll(clusterPattern)) {
            const body = cluster[1]
            const rangeTag = body.match(/<Range\b([^>]*)\/>/)
            if (!rangeTag) continue
            const lexemes: LexemeRef[] = []
            for (const lexeme of body.matchAll(lexemePattern)) {
                const id = attr(lexeme[1], "Id") ?? ""
                const colon = id.indexOf(":")
                if (colon < 0) continue
                lexemes.push({
                    type: id.slice(0, colon),
                    form: id.slice(colon + 1),
                    glossId: attr(lexeme[1], "GlossId")
                })
            }
            clusters.push({
                index: parseInt(attr(rangeTag[1], "Index") ?? "0", 10),
                length: parseInt(attr(rangeTag[1], "Length") ?? "0", 10),
                lexemes,
                excluded: /<Excluded>\s*true\s*<\/Excluded>/.test(body)
            })
        }

        const parsed: InterlinearItem = { chapter, label, ...range, clusters }
        items.set(`${chapter}:${label}`, parsed)
        const chapterItems = byChapter.get(chapter) ?? []
        chapterItems.push(parsed)
        byChapter.set(chapter, chapterItems)
    }
    return { items, byChapter }
}

function interlinearDir(projectDir: string, language: string): string {
    return path.join(projectDir, `${INTERLINEAR_DIR_PREFIX}${language}`)
}

function interlinearFile(projectDir: string, language: string, book: string): string {
    return path.join(interlinearDir(projectDir, language), `${INTERLINEAR_DIR_PREFIX}${language}_${book}.xml`)
}

function loadInterlinear(projectDir: string, projectId: string, language: string, book: string): InterlinearBook {
    const dir = interlinearDir(projectDir, language)
    if (!fs.existsSync(dir)) {
        throw new InterlinearNotFoundError(`No interlinear data for language ${language} in project ${projectId}`)
    }
    const filePath = interlinearFile(projectDir, language, book)
    if (!fs.existsSync(filePath)) {
        throw new InterlinearNotFoundError(`No ${language} interlinear data for ${book} in project ${projectId}`)
    }
    return cachedByMtime(interlinearCache, filePath, () => parseInterlinear(fs.readFileSync(filePath, "utf8")))
}

function findItem(data: InterlinearBook, target: VerseTarget): InterlinearItem | undefined {
    const exact = data.items.get(`${target.chapter}:${target.label}`)
    if (exact) return exact
    // Bridges may differ between the text and the interlinear data.
    return data.byChapter.get(target.chapter)?.find((item) => target.start <= item.end && item.start <= target.end)
}

// ---------- raw USFM verse segments ----------

const segmentCache = new Map<string, { mtimeMs: number; value: Map<string, string> }>()

// Split raw USFM (LF line endings) into segments keyed "C:label". Segment "C:V" starts at
// its \v marker; "C:0" starts at \c C (or file start for chapter 1). Segments end at the
// next \c or \v marker. Interlinear Range offsets are relative to these segments.
function splitSegments(usfm: string): Map<string, string> {
    const segments = new Map<string, string>()
    let chapter = 1
    let key = "1:0"
    let segmentStart = 0
    for (const marker of usfm.matchAll(/\\(c|v)\s+(\d+(?:-\d+)?)/g)) {
        const markerStart = marker.index ?? 0
        if (marker[1] === "c") {
            const nextChapter = parseInt(marker[2], 10)
            if (nextChapter === 1 && key === "1:0") continue
            segments.set(key, usfm.slice(segmentStart, markerStart))
            chapter = nextChapter
            key = `${chapter}:0`
        } else {
            segments.set(key, usfm.slice(segmentStart, markerStart))
            key = `${chapter}:${marker[2]}`
        }
        segmentStart = markerStart
    }
    segments.set(key, usfm.slice(segmentStart))
    return segments
}

function loadSegments(projectDir: string, projectId: string, book: string): Map<string, string> {
    const filePath = indexProjectBooks(projectDir).get(book)
    if (!filePath) throw new BookNotFoundError(projectId, book)
    return cachedByMtime(segmentCache, filePath, () =>
        splitSegments(fs.readFileSync(filePath, "utf8").replace(/\r\n?/g, "\n"))
    )
}

// ---------- verse -> [word, gloss] pairs (spec §4) ----------

function isWordCluster(cluster: Cluster): boolean {
    return cluster.lexemes.length === 1 && cluster.lexemes[0].type === "Word"
}

function verseWords(item: InterlinearItem, segment: string, lexicon: Lexicon): WordGloss[] {
    const groups = new Map<string, Cluster[]>()
    for (const cluster of item.clusters) {
        if (cluster.excluded) continue
        if (cluster.lexemes.length === 0) continue
        if (cluster.lexemes.some((l) => l.type === "Phrase")) continue
        const key = `${cluster.index}:${cluster.length}`
        const group = groups.get(key) ?? []
        group.push(cluster)
        groups.set(key, group)
    }

    const entries: { index: number; length: number; word: WordGloss }[] = []
    for (const group of groups.values()) {
        const { index, length } = group[0]
        const slice = segment.slice(index, index + length)
        const wordClusters = group.filter(isWordCluster)

        const current = wordClusters.find((c) => normalizeForm(c.lexemes[0].form) === normalizeForm(slice))
        if (current) {
            entries.push({ index, length, word: [slice, lookupGloss(lexicon, current.lexemes[0])] })
        } else if (wordClusters.length > 0) {
            // Stale: text was edited after glossing, so trust the analysis instead.
            const lexeme = wordClusters[0].lexemes[0]
            entries.push({ index, length, word: [lexeme.form, lookupGloss(lexicon, lexeme)] })
        } else {
            // Morpheme analysis only; no whole-word gloss.
            entries.push({ index, length, word: [slice, null] })
        }
    }

    entries.sort((a, b) => a.index - b.index || a.length - b.length)
    return entries.map((e) => e.word)
}

// ---------- reference handling ----------

const REF_PATTERN = /^(?:([A-Za-z0-9]{3})\s+)?(\d+)\s*(?::\s*(\d+)\s*(?:-\s*(\d+)\s*(?::\s*(\d+))?)?)?$/

export function parseRefs(refs: string): BookSpan[] {
    const parts = refs.split(";").map((p) => p.trim()).filter((p) => p.length > 0)
    if (parts.length === 0) throw new InvalidReferenceError("No verse references given")

    const result: BookSpan[] = []
    let book: string | undefined
    for (const part of parts) {
        const match = part.match(REF_PATTERN)
        if (!match) throw new InvalidReferenceError(`Unparseable reference: ${part}`)
        const [, bookPart, c, v, x, y] = match
        if (bookPart) {
            if (!isBookCode(bookPart)) throw new InvalidReferenceError(`Not a valid USFM book code: ${bookPart}`)
            book = bookPart.toUpperCase()
        }
        if (!book) throw new InvalidReferenceError(`First reference must include a book: ${part}`)

        const chapter = parseInt(c, 10)
        let span: Span
        if (v === undefined) {
            span = { startChapter: chapter }
        } else if (x === undefined) {
            span = { startChapter: chapter, startVerse: parseInt(v, 10), endVerse: parseInt(v, 10) }
        } else if (y === undefined) {
            span = { startChapter: chapter, startVerse: parseInt(v, 10), endVerse: parseInt(x, 10) }
        } else {
            span = { startChapter: chapter, startVerse: parseInt(v, 10), endChapter: parseInt(x, 10), endVerse: parseInt(y, 10) }
        }
        result.push({ book, span })
    }
    return result
}

function maxVerseNumber(verses: { end: number }[]): number {
    return verses.reduce((max, v) => Math.max(max, v.end), 0)
}

// Expand a span to verse targets with the same defaults as get-scripture.
function expandSpan(
    parsed: ParsedBook,
    book: string,
    span: Span,
    onMissing: (ref: string) => void
): VerseTarget[] {
    const chapters = [...parsed.chapters.keys()].sort((a, b) => a - b)
    const startChapter = span.startChapter ?? chapters[0] ?? 1
    const endChapter = span.endChapter ?? span.startChapter ?? chapters[chapters.length - 1] ?? startChapter
    if (endChapter < startChapter) {
        throw new InvalidReferenceError(`End chapter ${endChapter} is before start chapter ${startChapter}`)
    }

    const targets: VerseTarget[] = []
    for (let chapter = startChapter; chapter <= endChapter; chapter++) {
        const verses = parsed.chapters.get(chapter)
        if (!verses) {
            onMissing(`${book} ${chapter}`)
            continue
        }
        const verseStart = chapter === startChapter && span.startVerse ? span.startVerse : 1
        const verseEnd = chapter === endChapter && span.endVerse ? span.endVerse : maxVerseNumber(verses)
        for (let verse = verseStart; verse <= verseEnd; verse++) {
            const entry = verses.find((v) => verse >= v.start && verse <= v.end)
            if (!entry) {
                onMissing(`${book} ${chapter}:${verse}`)
                continue
            }
            targets.push({ book, chapter, label: entry.label, start: entry.start, end: entry.end })
        }
    }
    return targets
}

// ---------- public API ----------

export function listInterlinearLanguages(projectsRoot: string, projectId: string, book?: string): string[] {
    const projectDir = getProjectDir(projectsRoot, projectId)
    const bookCode = book?.toUpperCase()
    if (bookCode !== undefined && !isBookCode(bookCode)) {
        throw new InvalidReferenceError(`Not a valid USFM book code: ${book}`)
    }
    return fs
        .readdirSync(projectDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(INTERLINEAR_DIR_PREFIX))
        .map((entry) => entry.name.slice(INTERLINEAR_DIR_PREFIX.length))
        .filter((language) => language.length > 0)
        .filter((language) => !bookCode || fs.existsSync(interlinearFile(projectDir, language, bookCode)))
        .sort()
}

export function getInterlinear(request: InterlinearRequest): InterlinearResult {
    const allowPartial = request.allowPartial ?? false
    const missing: string[] = []
    const onMissing = (ref: string) => {
        if (!allowPartial) throw new VerseNotFoundError(ref)
        missing.push(ref)
    }

    if (!LANGUAGE_PATTERN.test(request.language)) {
        throw new InvalidReferenceError(`Not a valid language code: ${request.language}`)
    }

    const hasStructured = request.book !== undefined
        || request.startChapter !== undefined
        || request.startVerse !== undefined
        || request.endChapter !== undefined
        || request.endVerse !== undefined
    const hasRefs = request.refs !== undefined
    if (hasStructured && hasRefs) {
        throw new InvalidReferenceError("Specify either refs or book/chapter/verse, not both")
    }
    if (!hasStructured && !hasRefs) {
        throw new InvalidReferenceError("Specify either refs or book")
    }

    let bookSpans: BookSpan[]
    if (hasRefs) {
        bookSpans = parseRefs(request.refs ?? "")
    } else {
        const book = (request.book ?? "").toUpperCase()
        if (!isBookCode(book)) throw new InvalidReferenceError(`Not a valid USFM book code: ${request.book ?? ""}`)
        const { startChapter, startVerse, endChapter, endVerse } = request
        bookSpans = [{ book, span: { startChapter, startVerse, endChapter, endVerse } }]
    }

    const projectDir = getProjectDir(request.projectsRoot, request.project)
    const lexicon = loadLexicon(projectDir)

    // Per-book data, loaded lazily. null = unavailable (only when allowPartial).
    const books = new Map<string, ParsedBook | null>()
    const interlinears = new Map<string, InterlinearBook | null>()

    const verses: InterlinearVerse[] = []
    const seen = new Set<string>()
    for (const { book, span } of bookSpans) {
        if (!books.has(book)) {
            try {
                books.set(book, loadBook(projectDir, request.project, book))
            } catch (err) {
                // Structured form: a missing book is always an error (spec §7).
                if (!(err instanceof BookNotFoundError) || !allowPartial || !hasRefs) throw err
                missing.push(err.message)
                books.set(book, null)
            }
        }
        const parsed = books.get(book)
        if (!parsed) continue

        if (!interlinears.has(book)) {
            try {
                interlinears.set(book, loadInterlinear(projectDir, request.project, request.language, book))
            } catch (err) {
                if (!(err instanceof InterlinearNotFoundError) || !allowPartial) throw err
                missing.push(err.message)
                interlinears.set(book, null)
            }
        }
        const interlinear = interlinears.get(book)
        const segments = interlinear ? loadSegments(projectDir, request.project, book) : undefined

        for (const target of expandSpan(parsed, book, span, onMissing)) {
            const ref = `${book} ${target.chapter}:${target.label}`
            if (seen.has(ref)) continue
            seen.add(ref)

            const item = interlinear ? findItem(interlinear, target) : undefined
            if (!item || !segments) {
                verses.push({ ref, words: [] })
                continue
            }
            const segment = segments.get(`${item.chapter}:${item.label}`) ?? ""
            verses.push({ ref, words: verseWords(item, segment, lexicon) })
        }
    }

    return { verses, missing }
}
