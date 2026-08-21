import fs from "node:fs"
import path from "node:path"

const WINDOWS_DEFAULT_PROJECTS_DIR = "C:\\My Paratext 9 Projects"

export class ProjectsRootNotFoundError extends Error {
    constructor(root: string) {
        super(`Paratext projects folder not found: ${root}`)
        this.name = "ProjectsRootNotFoundError"
    }
}

export class ProjectNotFoundError extends Error {
    constructor(projectId: string) {
        super(`Paratext project not found: ${projectId}`)
        this.name = "ProjectNotFoundError"
    }
}

export function resolveProjectsRoot(cliArg?: string): string {
    const root = cliArg ?? process.env.PARATEXT_PROJECTS_DIR ?? WINDOWS_DEFAULT_PROJECTS_DIR
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        throw new ProjectsRootNotFoundError(root)
    }
    return root
}

export function listProjects(projectsRoot: string): string[] {
    return fs
        .readdirSync(projectsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => fs.existsSync(path.join(projectsRoot, entry.name, "Settings.xml")))
        .map((entry) => entry.name)
        .sort()
}

export function getProjectDir(projectsRoot: string, projectId: string): string {
    const dir = path.join(projectsRoot, projectId)
    if (!fs.existsSync(dir) || !fs.existsSync(path.join(dir, "Settings.xml"))) {
        throw new ProjectNotFoundError(projectId)
    }
    return dir
}
