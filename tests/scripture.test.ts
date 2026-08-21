import { describe, expect, it } from "vitest"
import {
    BookNotFoundError,
    getScripture,
    InvalidReferenceError,
    listAvailableBooks,
    listAvailableProjects,
    VerseNotFoundError
} from "../src/scripture.js"
import { ProjectNotFoundError } from "../src/discovery.js"
import { PROJECTS_ROOT } from "./testUtils.js"

describe("getScripture - single project", () => {
    it("returns a single verse in 'BOOK C:V text' format with no project prefix", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN",
            startChapter: 1,
            startVerse: 1,
            endVerse: 1
        })
        expect(result.text).toBe("GEN 1:1 In the beginning God created the heavens and the earth.")
        expect(result.missing).toEqual([])
    })

    it("returns a verse range within a chapter, one verse per line", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN",
            startChapter: 1,
            startVerse: 1,
            endVerse: 3
        })
        const lines = result.text.split("\n")
        expect(lines).toHaveLength(3)
        expect(lines[0]).toMatch(/^GEN 1:1 /)
        expect(lines[2]).toMatch(/^GEN 1:3 /)
    })

    it("returns a whole chapter when no verses are specified", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN",
            startChapter: 1
        })
        expect(result.text.split("\n")[0]).toMatch(/^GEN 1:1 /)
        expect(result.text).toMatch(/^GEN 1:31 /m)
    })

    it("returns a range spanning chapters", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN",
            startChapter: 1,
            startVerse: 31,
            endChapter: 2,
            endVerse: 2
        })
        const lines = result.text.split("\n")
        expect(lines[0]).toMatch(/^GEN 1:31 /)
        expect(lines[lines.length - 1]).toMatch(/^GEN 2:2 /)
    })

    it("returns the whole book when no chapter is specified", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN"
        })
        expect(result.text).toMatch(/^GEN 1:1 /m)
        expect(result.text).toMatch(/^GEN 50:\d+ /m)
    })
})

describe("getScripture - multiple projects", () => {
    it("prefixes each line with the project id and interleaves verses", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV", "WEB"],
            book: "GEN",
            startChapter: 1,
            startVerse: 2,
            endVerse: 3
        })
        expect(result.text).toBe(
            [
                "ASV GEN 1:2 And the earth was waste and void; and darkness was upon the face of the deep: and the Spirit of God moved upon the face of the waters.",
                "WEB GEN 1:2 The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters.",
                "",
                "ASV GEN 1:3 And God said, Let there be light: and there was light.",
                "WEB GEN 1:3 God said, “Let there be light,” and there was light."
            ].join("\n")
        )
    })
})

describe("getScripture - errors", () => {
    it("throws InvalidReferenceError for a bad book code", () => {
        expect(() =>
            getScripture({ projectsRoot: PROJECTS_ROOT, projects: ["ASV"], book: "XYZ" })
        ).toThrow(InvalidReferenceError)
    })

    it("throws ProjectNotFoundError for an unknown project", () => {
        expect(() =>
            getScripture({ projectsRoot: PROJECTS_ROOT, projects: ["NOPE"], book: "GEN" })
        ).toThrow(ProjectNotFoundError)
    })

    it("throws BookNotFoundError when a project lacks the requested book", () => {
        expect(() =>
            getScripture({ projectsRoot: PROJECTS_ROOT, projects: ["ASV"], book: "JHN" })
        ).toThrow(BookNotFoundError)
    })

    it("throws VerseNotFoundError for a verse past the end of a chapter", () => {
        expect(() =>
            getScripture({ projectsRoot: PROJECTS_ROOT, projects: ["ASV"], book: "GEN", startChapter: 1, startVerse: 999, endVerse: 999 })
        ).toThrow(VerseNotFoundError)
    })
})

describe("getScripture - allowPartial", () => {
    it("omits a missing project's book instead of throwing, and reports it", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["WEB", "ASV"],
            book: "JHN",
            startChapter: 1,
            startVerse: 1,
            endVerse: 1,
            allowPartial: true
        })
        expect(result.text).toMatch(/^WEB JHN 1:1 /)
        expect(result.missing.some((m) => m.includes("ASV"))).toBe(true)
    })

    it("omits a missing verse instead of throwing, when the request runs past the end of the chapter", () => {
        const result = getScripture({
            projectsRoot: PROJECTS_ROOT,
            projects: ["ASV"],
            book: "GEN",
            startChapter: 1,
            startVerse: 1,
            endVerse: 40,
            allowPartial: true
        })
        expect(result.missing.length).toBeGreaterThan(0)
        expect(result.text).toMatch(/^GEN 1:1 /)
    })
})

describe("listAvailableProjects / listAvailableBooks", () => {
    it("lists projects", () => {
        const projects = listAvailableProjects(PROJECTS_ROOT)
        expect(projects).toContain("ASV")
        expect(projects).toContain("WEB")
        expect(projects.indexOf("ASV")).toBeLessThan(projects.indexOf("WEB"))
    })

    it("lists books present in canonical order", () => {
        const books = listAvailableBooks(PROJECTS_ROOT, "WEB")
        expect(books).toContain("GEN")
        expect(books.indexOf("GEN")).toBeLessThan(books.indexOf("PSA"))
    })
})
