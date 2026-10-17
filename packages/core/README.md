# @milesnl/ptx-core

Library for reading data from Paratext project folders: scripture text (USFM),
AKG-style interlinear glosses, and the Biblical Terms list. It is the data layer
used by the [`@milesnl/ptx-mcp`](https://www.npmjs.com/package/@milesnl/ptx-mcp) MCP server.

## Install

```bash
npm install @milesnl/ptx-core
```

Requires Node.js 20.11 or later. ESM only.

## Usage

```ts
import { resolveProjectsRoot, listProjects, getScripture } from "@milesnl/ptx-core"

const root = resolveProjectsRoot("/path/to/My Paratext 9 Projects")
console.log(listProjects(root))
```

Everything exported from the modules below is available from the package root:
`discovery` (project folders), `scripture`, `usfmBook`, `interlinear`, `books`, and `biblicalTerms`.

The Biblical Terms functions take the path to `BiblicalTerms.xml`; use
`resolveBiblicalTermsPath(paratextInstallDir?)` to locate it.

For whole-list access: `listTerms(termsPath)` returns every term with structured verse refs,
`listTermRenderings(projectsRoot, projectId)` returns a project's renderings, denials and notes, and
`resolveProjectTermsPath(projectsRoot, projectId, paratextInstallDir?)` finds the list a project uses
(from `<BiblicalTermsListSetting>` in its `Settings.xml`).

## License

ISC
