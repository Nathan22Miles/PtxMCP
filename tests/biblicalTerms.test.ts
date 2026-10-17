import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
    BiblicalTermsNotFoundError,
    getTermRefs,
    getTermRendering,
    listTermRenderings,
    listTerms,
    resolveBiblicalTermsPath,
    resolveProjectTermsPath,
    searchTerms,
    TermNotFoundError,
    TermRenderingsNotFoundError
} from "../src/biblicalTerms.js"
import { ProjectNotFoundError } from "../src/discovery.js"
import { PROJECTS_ROOT } from "./testUtils.js"
import { bookCodeFromNumber, bookNumberFromCode } from "../src/books.js"
import { InvalidReferenceError } from "../src/scripture.js"

// myParatext/Lists is git-ignored (large); skip data-dependent tests when it's absent.
const TERMS_PATH = path.join(import.meta.dirname, "..", "myParatext", "Lists", "BiblicalTerms.xml")
const hasTerms = fs.existsSync(TERMS_PATH)
// AKG-Uni is git-ignored too.
const hasAkg = fs.existsSync(path.join(PROJECTS_ROOT, "AKG-Uni", "TermRenderings.xml"))

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
        expect(resolveBiblicalTermsPath(undefined, ["/nope/BiblicalTerms.xml", __filename])).toBe(__filename)
    })

    it("throws naming the paths tried", () => {
        expect(() => resolveBiblicalTermsPath(undefined, ["/nope/a.xml"])).toThrow(BiblicalTermsNotFoundError)
        expect(() => resolveBiblicalTermsPath(undefined, ["/nope/a.xml"])).toThrow(/\/nope\/a\.xml/)
    })
})

describe("resolveBiblicalTermsPath with install dir", () => {
    it("uses Terms/Lists under the install dir", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ptx-"))
        fs.mkdirSync(path.join(dir, "Terms", "Lists"), { recursive: true })
        const file = path.join(dir, "Terms", "Lists", "BiblicalTerms.xml")
        fs.writeFileSync(file, "<x/>")
        expect(resolveBiblicalTermsPath(dir, [])).toBe(file)
    })

    it("hard errors without falling back to defaults", () => {
        expect(() => resolveBiblicalTermsPath("/nope/Paratext 9", [__filename])).toThrow(/Paratext 9/)
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

describe.skipIf(!hasAkg)("getTermRendering", () => {
    it("returns the project's renderings as stored, and denials as refs", () => {
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", EUANGELION))
            .toEqual({ renderings: "Akam* Aghuuŋ*", denials: "MRK 1:1", notes: "akam* aghuuŋ* - good talk; the ‘Gospel’" })
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", "Γαλιλαία").renderings)
            .toBe("Galilin distrigh*||Galilin Rɨm*")
    })

    it("returns multiline notes", () => {
        const notes = getTermRendering(PROJECTS_ROOT, "AKG-Uni", "Χριστός-2").notes
        expect(notes.split("\n").length).toBeGreaterThan(1)
        expect(notes).not.toMatch(/\r/)
    })

    it("decodes denials in canonical order with the book carried forward", () => {
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", "πνεῦμα + ἀκάθαρτος").denials).toBe("MAT 10:1; MRK 1:23")
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", "ἀκάθαρτος").denials).toBe("ACT 10:28")
    })

    it("matches the Id regardless of Unicode normalization", () => {
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", EUANGELION.normalize("NFC")).renderings).toBe("Akam* Aghuuŋ*")
    })

    it("returns empty strings for a term with no renderings or denials", () => {
        expect(getTermRendering(PROJECTS_ROOT, "AKG-Uni", "Ααρων (DC)")).toEqual({ renderings: "", denials: "", notes: "" })
    })

    it("errors for unknown terms, projects, and projects without TermRenderings.xml", () => {
        expect(() => getTermRendering(PROJECTS_ROOT, "AKG-Uni", "nope")).toThrow(TermNotFoundError)
        expect(() => getTermRendering(PROJECTS_ROOT, "NOPE", EUANGELION)).toThrow(ProjectNotFoundError)
        expect(() => getTermRendering(PROJECTS_ROOT, "WEB", EUANGELION)).toThrow(TermRenderingsNotFoundError)
    })
})

describe("listTerms", () => {
    it.skipIf(!hasTerms)("returns every term with structured refs", () => {
        const terms = listTerms(TERMS_PATH)
        expect(terms.length).toBeGreaterThan(1000)
        const term = terms.find((t) => t.id.normalize("NFC") === EUANGELION.normalize("NFC"))
        expect(term).toBeDefined()
        expect(term!.refs.length).toBeGreaterThan(0)
        expect(term!.refs[0]).toEqual(expect.objectContaining({ book: expect.any(String), chapter: expect.any(Number) }))
    })
})

describe("listTermRenderings", () => {
    it.skipIf(!hasAkg)("returns renderings, denials and notes for a project", () => {
        const renderings = listTermRenderings(PROJECTS_ROOT, "AKG-Uni")
        expect(renderings.length).toBeGreaterThan(0)
        expect(renderings.some((r) => r.renderings.length > 0)).toBe(true)
        for (const r of renderings) for (const d of r.denials) expect(d.book).toMatch(/^[0-9A-Z]{3}$/)
    })

    it("throws for an unknown project", () => {
        expect(() => listTermRenderings(PROJECTS_ROOT, "NoSuchProject")).toThrow(ProjectNotFoundError)
    })
})

describe("resolveProjectTermsPath", () => {
    function makeProject(setting: string | undefined): { root: string; id: string } {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "ptx-terms-"))
        const id = "TST"
        fs.mkdirSync(path.join(root, id))
        const body = setting === undefined ? "" : `<BiblicalTermsListSetting>${setting}</BiblicalTermsListSetting>`
        fs.writeFileSync(path.join(root, id, "Settings.xml"), `<ScriptureText>${body}</ScriptureText>`)
        return { root, id }
    }

    it("resolves a list stored in a project folder", () => {
        const { root, id } = makeProject("Project:TST:ProjectBiblicalTerms.xml")
        fs.writeFileSync(path.join(root, id, "ProjectBiblicalTerms.xml"), "<BiblicalTermsList/>")
        expect(resolveProjectTermsPath(root, id)).toBe(path.join(root, id, "ProjectBiblicalTerms.xml"))
    })

    it("throws when the project list file is missing", () => {
        const { root, id } = makeProject("Project:TST:Missing.xml")
        expect(() => resolveProjectTermsPath(root, id)).toThrow(BiblicalTermsNotFoundError)
    })

    it("looks up a Paratext-shipped list in the install dir", () => {
        const { root, id } = makeProject("Major::AllBiblicalTerms.xml")
        const install = fs.mkdtempSync(path.join(os.tmpdir(), "ptx-install-"))
        fs.mkdirSync(path.join(install, "Terms", "Lists"), { recursive: true })
        fs.writeFileSync(path.join(install, "Terms", "Lists", "AllBiblicalTerms.xml"), "<BiblicalTermsList/>")
        expect(resolveProjectTermsPath(root, id, install)).toBe(path.join(install, "Terms", "Lists", "AllBiblicalTerms.xml"))
    })

    it.skipIf(!hasAkg)("reads the 11-digit verse refs used by project lists", () => {
        const terms = listTerms(resolveProjectTermsPath(PROJECTS_ROOT, "AKG-Uni"))
        const egyptian = terms.find((t) => t.id.normalize("NFC") === "Αἰγύπτιος".normalize("NFC"))
        expect(egyptian?.refs[0]).toEqual({ book: "ACT", chapter: 7, verse: 22 })
    })

    it.skipIf(!hasAkg)("resolves AKG-Uni's own list", () => {
        expect(resolveProjectTermsPath(PROJECTS_ROOT, "AKG-Uni")).toBe(
            path.join(PROJECTS_ROOT, "AKG-Uni", "ProjectBiblicalTerms.xml")
        )
    })
})
