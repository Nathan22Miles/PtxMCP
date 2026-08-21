# ptx-mcp

An MCP (Model Context Protocol) server that reads scripture text directly from
local Paratext project folders (USFM files) and exposes it as tools an LLM can call.

## Example prompts supported

Once the server is configured (see below), you can just ask Claude natural-language
questions — it picks the right tool and arguments on its own.

- "What Paratext projects do I have available?"
- "What books are in the WEB project?"
- "Show me Genesis 1:1 from WEB."
- "Get John chapter 3 from WEB."
- "Show me the whole book of Jonah from WEB."
- "Compare Genesis 1:1-5 in WEB and BTBK side by side."
- "Get James 1 from WEB and BTBK together, and skip any verses that are missing in either one."
- "Read Genesis 1:26 through 2:3 from BTBK."
- "Does BTBK have a translation of the Gospel of John? If so, show me chapter 1."

## Caveats


## Requirements

- Node.js 18+
- One or more Paratext project folders on disk (each containing a `Settings.xml`
  and `*.SFM` book files)

## Setup

No install step is required — the server is run via `npx`.

The server needs to know where your Paratext projects live. It resolves this in
order:

1. A CLI argument passed at startup
2. The `PARATEXT_PROJECTS_DIR` environment variable
3. The default Paratext location on Windows: `C:\My Paratext 9 Projects`

### Configure in Claude Desktop / Claude Code

#### Location of claude_desktop_config.json
- macOS: ~/Library/Application Support/Claude
- Windows: %APPDATA%\Claude 
    - (typically C:\Users\<you>\AppData\Roaming\Claude)
- Linux: ~/.config/Claude

#### Before ptx-msp is published

To run from client locally installed source
- install Node
- cd /path/to/source/PtxMCP
- npm install

Add to your MCP client's config (e.g. `claude_desktop_config.json`):

```json
"mcpServers": {
    "ptx-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "/path/to/source/PtxMCP",
        "/path/to/source/myParatextProjects"
      ]
    }
  }
```

If you don't have Paratext installed you can use /path/to/source/PtxMCP/myParatextProjects
in order to test MCP server using the freely available WEB version.

#### After ptx-mcp has been published:

```json
{
  "mcpServers": {
    "ptx-mcp": {
      "command": "npx",
      "args": ["-y", "ptx-mcp", "/path/to/My Paratext Projects"]
    }
  }
}
```

Or, without a CLI argument, using the environment variable instead:

```json
{
  "mcpServers": {
    "ptx-mcp": {
      "command": "npx",
      "args": ["-y", "ptx-mcp"],
      "env": {
        "PARATEXT_PROJECTS_DIR": "/path/to/My Paratext Projects"
      }
    }
  }
}
```



## Tools

### `list-projects`

Lists the Paratext project ids (folder names) found under the projects root.

### `list-books`

Lists the 3-letter USFM book codes present in a given project.

- `project` — project id (folder name)

### `get-scripture`

Returns verse text for a book, chapter, or verse range from one or more projects.

- `projects` — one or more project ids to fetch text from
- `book` — 3-letter USFM book code (e.g. `GEN`, `MAT`, `1CO`)
- `startChapter` / `startVerse` / `endChapter` / `endVerse` — optional; omit all
  four for the whole book, omit verses for a whole chapter, or specify a full
  range (which may span chapters)
- `allowPartial` — if `true`, silently omits missing projects/books/verses
  instead of returning an error

Output is plain verse text only — no section headings, book titles, footnotes,
or cross-references — one verse per line, formatted as `BOOK CHAPTER:VERSE text`.

When multiple projects are requested, each line is prefixed with the project id
and verses are interleaved project-by-project:

```
WEB GEN 1:1 In the beginning God created the heavens and the earth.
BTBR GEN 1:1 In the beginning, when God began to create all things,

WEB GEN 1:2 The earth was formless and empty ...
BTBR GEN 1:2 the earth did not exist yet, there still was nothing...
```

Verse bridges in the source text (e.g. `\v 6-7`) are returned as a single line
labeled `6-7`, not duplicated per verse number.

## Development

```bash
npm install
npm run build   # compile TypeScript to dist/
npm test        # run the Vitest suite (uses the myParatextProjects/ fixture data)
```

Tests read real Paratext project data from the local `myParatextProjects/`
folder, which is not checked into version control.

## Acknowledgements

## To Do
- Provide auto install, e.g. 'npx @milesnl/ptx-mcp --install'
