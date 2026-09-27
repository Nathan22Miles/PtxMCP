import fs from "node:fs"
import path from "node:path"
import { bookNumberFromCode, isBookCode } from "./books.js"
import { getProjectDir } from "./discovery.js"
import { BookNotFoundError, InvalidReferenceError, loadBook, VerseNotFoundError } from "./scripture.js"
import { indexProjectBooks, ParsedBook } from "./usfmBook.js"

// Interlinear data layout is documented in src/md/it/it_spec.md; best-effort glossing in it_update1.md.

export class InterlinearNotFoundError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InterlinearNotFoundError"
    }
}

// Where a word's gloss came from: approved in this verse, guessed from the corpus,
// first sense of a matching lexicon entry, or none.
export type GlossSource = "a" | "g" | "l" | "-"

export type WordGloss = [string, string] | [string, string, GlossSource]

const NO_GLOSS = "_"

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
    showSource?: boolean
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
}

interface Lexicon {
    // key: "Type:form#senseId"
    byLexemeSense: Map<string, string>
    // senseId -> gloss, only for sense ids used by a single lexeme
    bySense: Map<string, string>
    // lowercased NFC form -> gloss language -> first non-empty sense gloss (Word entries win over other types)
    byForm: Map<string, Map<string, string>>
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
    const wordForms = new Map<string, Map<string, string>>()
    const otherForms = new Map<string, Map<string, string>>()

    const itemPattern = /<Lexeme\b([^>]*)\/>([\s\S]*?)<\/item>/g
    const sensePattern = /<Sense\b([^>]*)>\s*<Gloss\b([^>]*?)(?:\/>|>([^<]*)<\/Gloss>)/g
    for (const item of xml.matchAll(itemPattern)) {
        const type = attr(item[1], "Type")
        const form = attr(item[1], "Form")
        if (!type || form === undefined) continue
        const forms = type === "Word" ? wordForms : otherForms
        const formKey = normalizeForm(form)
        for (const sense of item[2].matchAll(sensePattern)) {
            const senseId = attr(sense[1], "Id")
            if (!senseId) continue
            const gloss = decodeXml(sense[3] ?? "")
            byLexemeSense.set(`${type}:${form}#${senseId}`, gloss)
            senseGloss.set(senseId, gloss)
            senseCount.set(senseId, (senseCount.get(senseId) ?? 0) + 1)

            const language = attr(sense[2], "Language")
            if (!language || !gloss.trim()) continue
            const firstByLanguage = forms.get(formKey) ?? new Map<string, string>()
            if (!firstByLanguage.has(language)) firstByLanguage.set(language, gloss)
            forms.set(formKey, firstByLanguage)
        }
    }

    const byForm = new Map(otherForms)
    for (const [formKey, firstByLanguage] of wordForms) {
        byForm.set(formKey, new Map([...(otherForms.get(formKey) ?? []), ...firstByLanguage]))
    }

    const bySense = new Map<string, string>()
    for (const [senseId, gloss] of senseGloss) {
        if (senseCount.get(senseId) === 1) bySense.set(senseId, gloss)
    }
    return { byLexemeSense, bySense, byForm }
}

function loadLexicon(projectDir: string): Lexicon {
    const filePath = path.join(projectDir, "lexicon.xml")
    if (!fs.existsSync(filePath)) return { byLexemeSense: new Map(), bySense: new Map(), byForm: new Map() }
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
    }
    return { items }
}

function interlinearDir(projectDir: string, language: string): string {
    return path.join(projectDir, `${INTERLINEAR_DIR_PREFIX}${language}`)
}

function interlinearFile(projectDir: string, language: string, book: string): string {
    return path.join(interlinearDir(projectDir, language), `${INTERLINEAR_DIR_PREFIX}${language}_${book}.xml`)
}

function loadInterlinearFile(filePath: string): InterlinearBook {
    return cachedByMtime(interlinearCache, filePath, () => parseInterlinear(fs.readFileSync(filePath, "utf8")))
}

// Interlinear data for a book, or undefined if the language has no file for it.
function loadInterlinear(projectDir: string, language: string, book: string): InterlinearBook | undefined {
    const filePath = interlinearFile(projectDir, language, book)
    return fs.existsSync(filePath) ? loadInterlinearFile(filePath) : undefined
}

// ---------- corpus: most common gloss per word form ----------

interface Corpus {
    signature: string
    lexicon: Lexicon
    // lowercased NFC form -> most common gloss
    glosses: Map<string, string>
}

const corpusCache = new Map<string, Corpus>()

function interlinearFiles(dir: string, language: string): string[] {
    const prefix = `${INTERLINEAR_DIR_PREFIX}${language}_`
    const bookOf = (file: string) => file.slice(prefix.length, -".xml".length).toUpperCase()
    const order = (file: string) => bookNumberFromCode(bookOf(file)) ?? Number.MAX_SAFE_INTEGER
    return fs
        .readdirSync(dir)
        .filter((file) => file.startsWith(prefix) && file.toLowerCase().endsWith(".xml"))
        // Canon order so ties resolve to the first gloss seen in canon order.
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
        .map((file) => path.join(dir, file))
}

// Most common gloss for each word form across all books of a gloss language (it_update1.md).
function loadCorpus(dir: string, language: string, lexicon: Lexicon): Map<string, string> {
    const files = interlinearFiles(dir, language)
    const signature = files.map((file) => `${file}:${fs.statSync(file).mtimeMs}`).join("|")
    const cached = corpusCache.get(dir)
    if (cached && cached.signature === signature && cached.lexicon === lexicon) return cached.glosses

    // form -> gloss -> count; Map insertion order records first-seen order for ties.
    const counts = new Map<string, Map<string, number>>()
    for (const file of files) {
        for (const item of loadInterlinearFile(file).items.values()) {
            for (const cluster of item.clusters) {
                if (cluster.excluded || !isWordCluster(cluster)) continue
                const lexeme = cluster.lexemes[0]
                const gloss = lookupGloss(lexicon, lexeme)
                if (!gloss) continue
                const form = normalizeForm(lexeme.form)
                const formCounts = counts.get(form) ?? new Map<string, number>()
                formCounts.set(gloss, (formCounts.get(gloss) ?? 0) + 1)
                counts.set(form, formCounts)
            }
        }
    }

    const glosses = new Map<string, string>()
    for (const [form, formCounts] of counts) {
        let best: string | undefined
        let bestCount = 0
        for (const [gloss, count] of formCounts) {
            if (count > bestCount) {
                best = gloss
                bestCount = count
            }
        }
        if (best !== undefined) glosses.set(form, best)
    }
    corpusCache.set(dir, { signature, lexicon, glosses })
    return glosses
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

// ---------- verse -> [word, gloss] pairs (it_update1.md) ----------

function isWordCluster(cluster: Cluster): boolean {
    return cluster.lexemes.length === 1 && cluster.lexemes[0].type === "Word"
}

interface Token {
    index: number
    text: string
}

// USFM content that is not verse text. Replaced by spaces so offsets stay aligned with the segment.
const NON_TEXT_PATTERNS = [
    /\\(f|fe|x)\s[\s\S]*?\\\1\*/g,                // footnotes, endnotes, cross-refs
    /(^|\n)\\(s\d*|ms\d*|mr|r|sr|d)(?=\s)[^\n]*/g,  // headings, Psalm titles
    /\|[^\\\n]*/g,                                // word attributes: \w word|attrs\w*
    /\\(c|v)\s+\S+/g,                              // chapter/verse numbers
    /\\\+?[A-Za-z0-9]+\*?/g                         // other markers
]

// Split a segment into words: runs of Unicode letters and combining marks in verse text.
export function tokenize(segment: string): Token[] {
    let text = segment
    for (const pattern of NON_TEXT_PATTERNS) {
        text = text.replace(pattern, (match) => " ".repeat(match.length))
    }
    return [...text.matchAll(/[\p{L}\p{M}]+/gu)].map((m) => ({ index: m.index ?? 0, text: m[0] }))
}

function verseWords(
    segment: string,
    item: InterlinearItem | undefined,
    lexicon: Lexicon,
    corpus: Map<string, string>,
    language: string,
    showSource: boolean
): WordGloss[] {
    // Word clusters by exact range; others (stale, Stem/affix, Phrase) don't apply to a token.
    const approved = new Map<string, Cluster[]>()
    for (const cluster of item?.clusters ?? []) {
        if (cluster.excluded || !isWordCluster(cluster)) continue
        const key = `${cluster.index}:${cluster.length}`
        approved.set(key, [...(approved.get(key) ?? []), cluster])
    }

    return tokenize(segment).map((token) => {
        const form = normalizeForm(token.text)
        let gloss: string | null = null
        let source: GlossSource = "-"

        for (const cluster of approved.get(`${token.index}:${token.text.length}`) ?? []) {
            if (normalizeForm(cluster.lexemes[0].form) !== form) continue
            gloss = lookupGloss(lexicon, cluster.lexemes[0]) || null
            if (gloss) {
                source = "a"
                break
            }
        }
        if (!gloss) {
            gloss = corpus.get(form) ?? null
            if (gloss) source = "g"
        }
        if (!gloss) {
            gloss = lexicon.byForm.get(form)?.get(language) ?? null
            if (gloss) source = "l"
        }

        const word = token.text
        return showSource ? [word, gloss ?? NO_GLOSS, source] : [word, gloss ?? NO_GLOSS]
    })
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
    const showSource = request.showSource ?? false

    let corpus = new Map<string, string>()
    const languageDir = interlinearDir(projectDir, request.language)
    const hasLanguage = fs.existsSync(languageDir)
    if (hasLanguage) {
        corpus = loadCorpus(languageDir, request.language, lexicon)
    } else {
        const err = new InterlinearNotFoundError(
            `No interlinear data for language ${request.language} in project ${request.project}`
        )
        if (!allowPartial) throw err
        missing.push(err.message)
    }

    // Per-book text, loaded lazily. null = unavailable (only when allowPartial).
    const books = new Map<string, ParsedBook | null>()

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

        // No interlinear file for this book is fine: all words are guessed from other books.
        const interlinear = hasLanguage ? loadInterlinear(projectDir, request.language, book) : undefined
        const segments = loadSegments(projectDir, request.project, book)

        for (const target of expandSpan(parsed, book, span, onMissing)) {
            const ref = `${book} ${target.chapter}:${target.label}`
            if (seen.has(ref)) continue
            seen.add(ref)

            // Range offsets are relative to the item's own segment, so only use an item whose
            // verse label matches the text's; otherwise all words are guessed.
            const item = interlinear?.items.get(`${target.chapter}:${target.label}`)
            const segment = segments.get(`${target.chapter}:${target.label}`) ?? ""
            verses.push({ ref, words: verseWords(segment, item, lexicon, corpus, request.language, showSource) })
        }
    }

    return { verses, missing }
}
