import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
    BiblicalTermsNotFoundError,
    getTermRefs,
    resolveBiblicalTermsPath,
    searchTerms,
    TermNotFoundError
} from "../src/biblicalTerms.js"
import { bookCodeFromNumber, bookNumberFromCode } from "../src/books.js"
import { InvalidReferenceError } from "../src/scripture.js"

// myParatext/Lists is git-ignored (large); skip data-dependent tests when it's absent.
const TERMS_PATH = path.join(import.meta.dirname, "..", "myParatext", "Lists", "BiblicalTerms.xml")
const hasTerms = fs.existsSync(TERMS_PATH)

// Id as stored in the file uses U+1F73 (epsilon with oxia); NFC would turn it into U+03AD.
const EUANGELION = "εὐαγγέλιον"

describe("book numbers", () => {
    it("maps Paratext book numbers to codes and back", () => {
        expect(bookCodeFromNumber(1)).toBe("GEN")
        expect(bookCodeFromNumber(40)).toBe("MAT")
        expect(bookCodeFromNumber(45)).toBe("ROM")
        expect(bookCodeFromNumber(77)).toBe("1MA")
        expect(bookCodeFromNumber(999)).toBeUndefined()
        expect(bookNumberFromCode("rom")).toBe(45)
    })
})

describe("resolveBiblicalTermsPath", () => {
    it("returns the first existing candidate", () => {
        expect(resolveBiblicalTermsPath(["/nope/BiblicalTerms.xml", __filename])).toBe(__filename)
    })

    it("throws naming the paths tried", () => {
        expect(() => resolveBiblicalTermsPath(["/nope/a.xml"])).toThrow(BiblicalTermsNotFoundError)
        expect(() => resolveBiblicalTermsPath(["/nope/a.xml"])).toThrow(/\/nope\/a\.xml/)
    })
})

describe.skipIf(!hasTerms)("searchTerms", () => {
    it("finds terms by English gloss", () => {
        const ids = searchTerms(TERMS_PATH, "gospel").map((t) => t.id)
        expect(ids).toContain(EUANGELION)
    })

    it("returns summary fields with a unique-verse refCount", () => {
        const term = searchTerms(TERMS_PATH, "gospel").find((t) => t.id === EUANGELION)
        expect(term).toEqual({
            id: EUANGELION,
            gloss: "good news; gospel",
            transliteration: "euangelion",
            language: "greek",
            category: "MI",
            strong: ["G2098"],
            refCount: 73
        })
    })

    it("ignores case and diacritics in transliteration and lemma", () => {
        expect(searchTerms(TERMS_PATH, "EUANGELION").map((t) => t.id)).toContain(EUANGELION)
        expect(searchTerms(TERMS_PATH, "ευαγγελιον").map((t) => t.id)).toContain(EUANGELION)
    })

    it("matches Strong's numbers exactly", () => {
        expect(searchTerms(TERMS_PATH, "g2098").map((t) => t.id)).toEqual([EUANGELION])
    })

    it("filters by book", () => {
        expect(searchTerms(TERMS_PATH, "gospel", "ROM").map((t) => t.id)).toContain(EUANGELION)
        expect(searchTerms(TERMS_PATH, "gospel", "GEN").map((t) => t.id)).not.toContain(EUANGELION)
    })

    it("rejects an empty search or a bad book code", () => {
        expect(() => searchTerms(TERMS_PATH, "  ")).toThrow(InvalidReferenceError)
        expect(() => searchTerms(TERMS_PATH, "gospel", "XYZ")).toThrow(InvalidReferenceError)
    })
})

describe.skipIf(!hasTerms)("getTermRefs", () => {
    it("returns all refs in canonical order with the book carried forward", () => {
        const refs = getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION })
        expect(refs.startsWith("MAT ")).toBe(true)
        expect(refs.split(";")).toHaveLength(73)
        expect(refs).toMatch(/; ROM 1:1; 1:9; 1:16;/)
    })

    it("matches the Id regardless of Unicode normalization", () => {
        const refs = getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION.normalize("NFC"), book: "ROM", startChapter: 1 })
        expect(refs).toBe("ROM 1:1; 1:9; 1:16")
    })

    it("filters by structured range", () => {
        expect(getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, book: "ROM", startChapter: 1, startVerse: 2, endVerse: 10 }))
            .toBe("ROM 1:9")
        expect(getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, book: "REV" })).toBe("REV 14:6")
    })

    it("filters by refs list", () => {
        expect(getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, refs: "ROM 1:1; 1:16; GEN 1" })).toBe("ROM 1:1; 1:16")
    })

    it("returns an empty string when nothing matches", () => {
        expect(getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, book: "GEN" })).toBe("")
    })

    it("drops word positions and duplicate verses", () => {
        const refs = getTermRefs({ termsPath: TERMS_PATH, id: "אֶבֶן-2", book: "ZEC", startChapter: 3, startVerse: 9, endVerse: 9 })
        expect(refs).toBe("ZEC 3:9")
    })

    it("errors for unknown ids and conflicting filters", () => {
        expect(() => getTermRefs({ termsPath: TERMS_PATH, id: "nope" })).toThrow(TermNotFoundError)
        expect(() => getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, book: "ROM", refs: "ROM 1" }))
            .toThrow(InvalidReferenceError)
        expect(() => getTermRefs({ termsPath: TERMS_PATH, id: EUANGELION, startChapter: 1 }))
            .toThrow(InvalidReferenceError)
    })
})
