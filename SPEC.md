# PtxMCP

- MCP server for accessing scripture data from Paratext project folders
- TypeScript, distributed as a single `npx`-runnable package
- Use `usfm-js` for parsing USFM files

## Project discovery
- Projects root folder resolution order:
  1. CLI startup argument
  2. `PARATEXT_PROJECTS_DIR` env var
  3. Fallback default: `C:\My Paratext 9 Projects` (Windows)
- A project's id is its folder name (e.g. `BTBK`)
- For testing, use the data in the `myParatextProjects` folder

## Tools
- Request verse text from a single Bible, or from multiple Bibles at once
- Support requesting a whole book, a whole chapter, or a verse range
- Book identifiers are 3-letter USFM codes (GEN, MAT, 1CO, ...)

## Output format
- One verse per line
- Single-Bible request: `GEN 1:1 In the beginning God created the heavens and the earth.`
- Multi-Bible request: prefix each line with the Bible id, and interleave verses across Bibles per-reference:
  ```
  WEB GEN 1:1 In the beginning God created the heavens and the earth.
  BTBK GEN 1:1 In the beginning, when God began to create all things,

  WEB GEN 1:2 ...
  BTBK GEN 1:2 ...
  ```
- Only verse text — no section headings, book titles, footnotes, or cross-references

## Versification
- Assume standard English versification for all projects (no per-project versification file parsing)

## Scope
- Read-only — no writes to Paratext project folders

## Error handling
- Missing/invalid project, book, or verse reference returns an MCP tool error by default
- Optional flag to instead omit missing verses and return partial results silently

## Deliverables
- `_README.md` describing how to set up and use the MCP with Claude

## Testing
- Unit tests using Vitest, covering parsing and reference-range/lookup logic

## Open questions
- Full-text search across verses — deferred, not in initial scope
- Project/settings metadata tool (language, versification scheme) — deferred
- Node version target / minimum
