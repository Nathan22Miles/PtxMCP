# Spec: Configurable Paratext Installation Folder

## Goal
Let the user say, in the MCP settings, where Paratext is installed so the Biblical Terms tools
(`list-bt`, `get-bt-refs`, `get-rendering`) can find `BiblicalTerms.xml`.

## Configuration
- CLI args only. **No environment variables.** Remove existing `PARATEXT_PROJECTS_DIR` support too.
- Positional args in `args` after the package name:
    1. `argv[2]` projects folder (optional; default `C:\My Paratext 9 Projects`)
    2. `argv[3]` Paratext installation folder (optional)
- Installation folder = parent of `Terms\Lists`, e.g. `C:\Program Files\Paratext 9`.
- Biblical Terms file = `<installation folder>\Terms\Lists\BiblicalTerms.xml`.

```json
"args": ["-y", "@milesnl/ptx-mcp", "C:\\My Paratext 9 Projects", "C:\\Program Files\\Paratext 9"]
```

## Behavior
- `argv[3]` given: use only `<install>/Terms/Lists/BiblicalTerms.xml`. If missing, **hard error**
  (no fallback to defaults) naming the full path tried.
- `argv[3]` absent: unchanged default search (Program Files (x86) / Program Files / repo `myParatext/Lists`).
- Error is raised when a Biblical Terms tool is called, not at startup, so the scripture and
  interlinear tools keep working with a bad install path.

## Code changes
- `biblicalTerms.ts`: `resolveBiblicalTermsPath(installDir?, candidates = DEFAULT_TERMS_PATHS)`;
  helper builds the `Terms/Lists` path.
- `discovery.ts`: `resolveProjectsRoot` drops env var.
- `index.ts`: read `argv[2]`, `argv[3]`; pass to `createServer(projectsRoot, paratextInstallDir)`.
- `server.ts`: take `paratextInstallDir?`, pass to both `resolveBiblicalTermsPath` calls.
- Tests: override found, override missing throws (no fallback), default unchanged.
- README: document second arg, update Caveats. Version bump to 0.3.1; rebuild `dist`.
