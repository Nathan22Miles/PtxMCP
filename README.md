# ptx-mcp

MCP (Model Context Protocol) server that reads scripture text directly from
local Paratext project folders (USFM files) and exposes it as tools an LLM can call.

## Example prompts supported

Once the server is installed (see below), you can ask Claude natural-language
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
- This code
    - Has only had very limited testing so far. It did work for me on Mac and Windows.
    - Has only been tested with Claude Desktop.
    - Does not support access to Paratext resource projects, e.g. RVR80. 
- In order for Claude to access this stdin MCP server, Claude must be running on the local machine, not in the cloud.
    - I think this means you must choose the 'Chat' option and NOT the 'Cowork' option when starting the chat.
      The Cowork option seems to (at least sometimes?) run in a cloud sandbox that does not have access to the local machine.
## Requirements

- Node.js 18+
    - I think this is automatically installed when you install Claude Desktop
- One or more Paratext project folders on disk (each containing a `Settings.xml`
  and USFM book files)

## Setup/Installation

In Claude Desktop
- Click button with your name in the bottom left corner
- Click 'Settings'
- Click 'Developers'
- Click 'Edit Config'
- Double click 'claude_desktop_config.json' to open editor

Edit 'claude_desktop_config.json' to add server as follows

```json
{
  "mcpServers": {
    "ptx-mcp": {
      "command": "npx",
      "args": ["-y", "@milesnl/ptx-mcp"]
    }
  }
  ...
}
```

IMPORTANT! Close and restart Claude to load the new MCP server.

The ptx-mcp package will be automatically downloaded from the NPM library
the first time you give a Paratext related command to Claude.

To test installation ask Claude: "List Paratext projects"

### Installation Troubleshooting
- Go to command line and try 'npx -y @milesnl/ptx-mcp'
    - Successful outcome is runs and then waits for terminal input. Control C to terminate.
      If it prints error messages instead, there is some reason we cannot access the @milesn/ptx-mcp NPM package.
- After restarting Claude, go to Settings/Developers. 
  This should show ptx-mcp as a Local MCP Server. If not something went wrong with loading.
- If says "ptx-mcp failed", click "View Logs" to see why.

### Installation Notes

If your My Paratext folder is not at the default location, `C:\My Paratext 9 Projects`, you will
need to modify "args" to include that location.

```json
      "args": ["-y", "@milesnl/ptx-mcp", "/path/to/My Paratext 9 Projects"]
```

### To run ptx-mcp from source in development mode

To run from locally installed source
- cd /path/to/source
- git clone https://github.com/Nathan22Miles/PtxMCP
- cd PtxMCP
- npm install

Add to your MCP client's config (e.g. `claude_desktop_config.json`).

```json
"mcpServers": {
    "ptx-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "/path/to/PtxMCP"
      ]
    }
  }
```

If you don't have Paratext installed, you can add '/path/to/source/PtxMCP/myParatextProjects' to args.
This provides access to WEB project.

## MCP Supported Commands

Note: In most cases you do not need to know these low level commands.
Claude automatically translates your requests into this format to access the MCP.

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

Tests read aratext project data from the `myParatextProjects/` folder.

## Acknowledgements

Special thanks to [unfoldingWord](https://www.unfoldingword.org/) for [usfm-js](https://github.com/translationCoreApps/usfm-js), the USFM parser this project relies on.

## To Do
- Provide auto install, e.g. 'npx @milesnl/ptx-mcp --install'
- Try out with Gemini CLI etc.
