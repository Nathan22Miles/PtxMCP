import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bookCodeFromFile, indexProjectBooks, parseBookFile } from "../src/usfmBook.js"
import { PROJECTS_ROOT } from "./testUtils.js"

const ASV_GEN = path.join(PROJECTS_ROOT, "ASV", "01GENASV.SFM")
const WEB_JON = path.join(PROJECTS_ROOT, "WEB", "32JONengWEBUS.SFM")
const WEB_EXO = path.join(PROJECTS_ROOT, "WEB", "02EXOengWEBUS.SFM")

describe("bookCodeFromFile", () => {
    it("extracts the USFM book code from the \\id marker", () => {
        expect(bookCodeFromFile(ASV_GEN)).toBe("GEN")
    })
})

describe("indexProjectBooks", () => {
    it("maps book codes to file paths for a project", () => {
        const index = indexProjectBooks(path.join(PROJECTS_ROOT, "WEB"))
        expect(index.get("JON")).toBe(WEB_JON)
        expect(index.has("XXX")).toBe(false)
    })
})

describe("parseBookFile", () => {
    it("parses plain verse text without headings or paragraph markers", () => {
        const book = parseBookFile(ASV_GEN)
        expect(book.code).toBe("GEN")
        const verse1 = book.chapters.get(1)!.find((v) => v.start === 1)
        expect(verse1?.text).toBe("In the beginning God created the heavens and the earth.")
    })

    it("strips footnotes from verse text", () => {
        const jonah = parseBookFile(WEB_JON)
        const verse = jonah.chapters.get(1)!.find((v) => v.start === 1)!
        expect(verse.text).not.toMatch(/\\f|\\fr|\\ft/)
    })

    it("parses all 50 chapters of Genesis", () => {
        const book = parseBookFile(ASV_GEN)
        expect(book.chapters.size).toBe(50)
    })

    it("includes text from poetry line markers (\\q1/\\q2) within a verse", () => {
        const book = parseBookFile(WEB_EXO)
        const verse2 = book.chapters.get(15)!.find((v) => v.start === 2)!
        expect(verse2.text).toBe(
            "Yah is my strength and song. He has become my salvation. This is my God, and I will praise him; my father’s God, and I will exalt him."
        )
    })

    describe("bridged verses", () => {
        // ASV/WEB have no bridged verses in their canonical books, so this
        // exercises the parser against a small synthetic fixture instead.
        let tmpDir: string
        let bridgeFile: string

        beforeAll(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ptxmcp-bridge-"))
            bridgeFile = path.join(tmpDir, "01GENFIX.SFM")
            fs.writeFileSync(
                bridgeFile,
                [
                    "\\id GEN",
                    "\\c 1",
                    "\\p",
                    "\\v 5 Verse five.",
                    "\\v 6-7 Verse six and seven, bridged.",
                    "\\v 8 Verse eight."
                ].join("\n")
            )
        })

        afterAll(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true })
        })

        it("keeps bridged verses as a single labeled entry", () => {
            const book = parseBookFile(bridgeFile)
            const chapter1 = book.chapters.get(1)!
            const bridge = chapter1.find((v) => v.label === "6-7")
            expect(bridge).toBeDefined()
            expect(bridge!.start).toBe(6)
            expect(bridge!.end).toBe(7)
            expect(chapter1.find((v) => v.start === 6 && v.label !== "6-7")).toBeUndefined()
        })
    })
})
