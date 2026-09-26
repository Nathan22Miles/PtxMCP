import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { getInterlinear, InterlinearNotFoundError, listInterlinearLanguages, parseRefs } from "../src/interlinear.js"
import { ProjectNotFoundError } from "../src/discovery.js"
import { BookNotFoundError, InvalidReferenceError, VerseNotFoundError } from "../src/scripture.js"
import { PROJECTS_ROOT } from "./testUtils.js"

// AKG-Uni is git-ignored (large); skip data-dependent tests when it's absent.
const hasAkg = fs.existsSync(path.join(PROJECTS_ROOT, "AKG-Uni", "Settings.xml"))
const expectedRom11 = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "..", "src", "md", "it", "it_rom_1.1.json"), "utf8")
) as [string, string][]

const base = { projectsRoot: PROJECTS_ROOT, project: "AKG-Uni", language: "en" }

describe("parseRefs", () => {
    it("parses each span form and carries the book forward", () => {
        expect(parseRefs("ROM 2; 1:1; 1:3-5; 1:30-2:2; mat 5:3")).toEqual([
            { book: "ROM", span: { startChapter: 2 } },
            { book: "ROM", span: { startChapter: 1, startVerse: 1, endVerse: 1 } },
            { book: "ROM", span: { startChapter: 1, startVerse: 3, endVerse: 5 } },
            { book: "ROM", span: { startChapter: 1, startVerse: 30, endChapter: 2, endVerse: 2 } },
            { book: "MAT", span: { startChapter: 5, startVerse: 3, endVerse: 3 } }
        ])
    })

    it("accepts book codes starting with a digit", () => {
        expect(parseRefs("1CO 2:3")[0].book).toBe("1CO")
    })

    it("rejects a first ref without a book", () => {
        expect(() => parseRefs("1:1")).toThrow(InvalidReferenceError)
    })

    it("rejects invalid book codes and unparseable refs", () => {
        expect(() => parseRefs("XYZ 1:1")).toThrow(InvalidReferenceError)
        expect(() => parseRefs("ROM 1:a")).toThrow(InvalidReferenceError)
        expect(() => parseRefs(" ; ")).toThrow(InvalidReferenceError)
    })
})

describe.skipIf(!hasAkg)("listInterlinearLanguages", () => {
    it("lists languages from Interlinear_* folders", () => {
        const languages = listInterlinearLanguages(PROJECTS_ROOT, "AKG-Uni")
        expect(languages).toContain("en")
        expect(languages).toContain("en-US")
    })

    it("filters by book", () => {
        expect(listInterlinearLanguages(PROJECTS_ROOT, "AKG-Uni", "ROM")).toContain("en")
        expect(listInterlinearLanguages(PROJECTS_ROOT, "AKG-Uni", "GAL")).not.toContain("en-US")
    })

    it("throws for an unknown project", () => {
        expect(() => listInterlinearLanguages(PROJECTS_ROOT, "NOPE")).toThrow(ProjectNotFoundError)
    })
})

describe.skipIf(!hasAkg)("getInterlinear", () => {
    it("reproduces ROM 1:1 (glosses as stored in the lexicon)", () => {
        const result = getInterlinear({ ...base, book: "ROM", startChapter: 1, startVerse: 1, endVerse: 1 })
        expect(result.missing).toEqual([])
        expect(result.verses).toHaveLength(1)
        expect(result.verses[0].ref).toBe("ROM 1:1")
        const words = result.verses[0].words
        expect(words.map((w) => w[0])).toEqual(expectedRom11.map((w) => w[0]))
        expect(words.map((w) => w[1]?.toLowerCase())).toEqual(expectedRom11.map((w) => w[1].toLowerCase()))
    })

    it("accepts a refs list in request order without duplicates", () => {
        const result = getInterlinear({ ...base, refs: "ROM 1:3; 1:1-2; 1:2" })
        expect(result.verses.map((v) => v.ref)).toEqual(["ROM 1:3", "ROM 1:1", "ROM 1:2"])
    })

    it("returns bridged verses once with the bridge label", () => {
        const result = getInterlinear({ ...base, refs: "ROM 16:23; 16:24" })
        expect(result.verses.map((v) => v.ref)).toEqual(["ROM 16:23-24"])
    })

    it("uses the lexeme form for stale clusters", () => {
        // ROM 1:2 was edited after glossing, so ranges no longer match the text.
        const words = getInterlinear({ ...base, refs: "ROM 1:2" }).verses[0].words
        expect(words).toContainEqual(["ana", "it"])
    })

    it("requires exactly one reference form", () => {
        expect(() => getInterlinear({ ...base })).toThrow(InvalidReferenceError)
        expect(() => getInterlinear({ ...base, book: "ROM", refs: "ROM 1:1" })).toThrow(InvalidReferenceError)
    })

    it("errors for a missing verse unless allowPartial", () => {
        expect(() => getInterlinear({ ...base, refs: "ROM 1:999" })).toThrow(VerseNotFoundError)
        const result = getInterlinear({ ...base, refs: "ROM 1:999; 1:1", allowPartial: true })
        expect(result.verses.map((v) => v.ref)).toEqual(["ROM 1:1"])
        expect(result.missing).toEqual(["ROM 1:999"])
    })

    it("errors for a missing language unless allowPartial", () => {
        expect(() => getInterlinear({ ...base, language: "xx", refs: "ROM 1:1" })).toThrow(InterlinearNotFoundError)
        const result = getInterlinear({ ...base, language: "xx", refs: "ROM 1:1", allowPartial: true })
        expect(result.verses).toEqual([{ ref: "ROM 1:1", words: [] }])
        expect(result.missing).toHaveLength(1)
    })

    it("omits a missing book in refs with allowPartial, but errors in structured form", () => {
        const result = getInterlinear({ ...base, refs: "LEV 1:1; ROM 1:1", allowPartial: true })
        expect(result.verses.map((v) => v.ref)).toEqual(["ROM 1:1"])
        expect(result.missing).toHaveLength(1)
        expect(() => getInterlinear({ ...base, book: "LEV", allowPartial: true })).toThrow(BookNotFoundError)
    })

    it("rejects language codes that could escape the project folder", () => {
        expect(() => getInterlinear({ ...base, language: "../x", refs: "ROM 1:1" })).toThrow(InvalidReferenceError)
    })
})
