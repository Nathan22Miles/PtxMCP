import { describe, expect, it } from "vitest"
import { getProjectDir, listProjects, ProjectNotFoundError, ProjectsRootNotFoundError, resolveProjectsRoot } from "../src/discovery.js"
import { PROJECTS_ROOT } from "./testUtils.js"

describe("resolveProjectsRoot", () => {
    it("uses the CLI argument when provided", () => {
        expect(resolveProjectsRoot(PROJECTS_ROOT)).toBe(PROJECTS_ROOT)
    })

    it("throws when the resolved folder does not exist", () => {
        expect(() => resolveProjectsRoot("/no/such/paratext/projects")).toThrow(ProjectsRootNotFoundError)
    })
})

describe("listProjects", () => {
    it("lists the Paratext project ids present under the root", () => {
        const projects = listProjects(PROJECTS_ROOT)
        expect(projects).toContain("ASV")
        expect(projects).toContain("WEB")
        expect(projects).toEqual([...projects].sort())
    })
})

describe("getProjectDir", () => {
    it("returns the project directory for a known project", () => {
        expect(getProjectDir(PROJECTS_ROOT, "ASV")).toBe(`${PROJECTS_ROOT}/ASV`)
    })

    it("throws ProjectNotFoundError for an unknown project", () => {
        expect(() => getProjectDir(PROJECTS_ROOT, "NOPE")).toThrow(ProjectNotFoundError)
    })
})
