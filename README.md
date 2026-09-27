# ptx-mcp

MCP (Model Context Protocol) server that reads scripture text directly from
local Paratext project folders (USFM files) and exposes it as tools an LLM can call.
It can also return interlinear glosses (each word of a verse paired with its gloss)
from a project's Paratext interlinear data, and search Paratext's Biblical Terms
list for Hebrew/Greek terms and the verses they occur in.

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
- "What interlinear gloss languages does AKG-Uni have?"
- "Show me the English interlinear glosses for Romans 1:1 in AKG-Uni."
- "Get the AKG-Uni interlinear for ROM 1:1-5; 3:23; 6:23."
- "Show the AKG-Uni interlinear for Galatians 1 and mark which glosses are guesses."
- "What is the NT Greek word for 'gospel'?"
- "Where does εὐαγγέλιον occur in Romans? Show the AKG-Uni interlinear for those verses."
- "How does AKG-Uni translate 'gospel'?"

## Caveats
- This code
    - Has only had very limited testing so far. It did work for me on Mac and Windows.
    - Has only been tested with Claude Desktop.
    - Does not support access to Paratext resource projects, e.g. RVR80. 
    - Biblical Terms tools look for `BiblicalTerms.xml` in the Paratext 9 install folder
      (`C:\Program Files (x86)\Paratext 9\Terms\Lists` or `C:\Program Files\Paratext 9\Terms\Lists`),
      then in `myParatext/Lists` when running from source. These install locations are not yet verified.
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
  This should show ptx-mcp as a Local MCP Server. 
  If not something went wrong with loading.
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

### `list-it`

Lists the interlinear gloss language codes (e.g. `en`, `en-US`) that have
interlinear data in a project (from its `Interlinear_<language>` folders).

- `project` — project id (folder name)
- `book` — optional 3-letter book code; only list languages with interlinear data for that book

### `get-it`

Returns interlinear text: each word of the verse paired with its gloss in the
chosen gloss language.

- `project` — project id (folder name)
- `language` — gloss language code (see `list-it`)
- Verses, in one of two forms (not both):
    - `book` plus optional `startChapter` / `startVerse` / `endChapter` / `endVerse`,
      same meaning as in `get-scripture`
    - `refs` — semicolon-separated references, e.g. `ROM 1:1; 3:5-7; 1:30-2:2; MAT 5`.
      A reference without a book reuses the previous reference's book.
- `allowPartial` — if `true`, omits missing books/verses and returns `_` glosses
  when the gloss language has no interlinear data, instead of returning an error
- `showSource` — if `true`, each word gets a third element saying where the gloss
  came from: `a` approved in this verse, `g` guessed from other verses, `l` from the
  lexicon, `-` never glossed, e.g. `["Kɨ","I","a"]`

Output is JSON, one entry per verse:

```json
[{"ref":"ROM 1:1","words":[["Kɨ","I"],["Pol","Paul"],["kɨ","I"],["gemsua","for you.pl"]]}]
```

- Every word of the verse text is returned, in order (headings, footnotes and
  cross-references are skipped; a word is a run of letters).
- Each word's gloss is, in order of preference:
    1. the whole-word gloss approved for that word in this verse in Paratext's interlinearizer
    2. otherwise, the gloss most often approved for that word form anywhere in the gloss language's data
    3. otherwise, the first gloss (in the gloss language) of a lexicon entry with that form
    4. otherwise `_`
- Phrase glosses are not used.

When `allowPartial` reports missing items, they are listed in a second text
result: `[missing: ...]`.

See `src/md/it/it_spec.md` for details of the Paratext interlinear data layout, and
`src/md/it/it_update1.md` for how glosses are chosen.

### `list-bt`

Searches Paratext's Biblical Terms list (Hebrew, Aramaic and Greek terms).

- `search` — text found anywhere in a term's English gloss, original-language
  lemma, transliteration or definition (case- and diacritics-insensitive), or an
  exact Strong's number such as `G2098`
- `book` — optional 3-letter book code; only terms that occur in that book

Output is JSON, one entry per matching term, in list order (no limit):

```json
[{"id":"εὐαγγέλιον","gloss":"good news; gospel","transliteration":"euangelion","language":"greek","category":"MI","strong":["G2098"],"refCount":73}]
```

`category` is one of `PN` (names), `RE` (realia), `AT` (attributes), `MI`
(miscellaneous), `FA` (fauna), `BE` (beings), `FL` (flora), `RI` (rituals).
`refCount` is the number of verses the term occurs in.

### `get-bt-refs`

Returns the verses where a term occurs, as a reference string that can be passed
directly as `refs` to `get-it`.

- `id` — term id from `list-bt` (including any `-1`, `-2` suffix)
- Optional filter, in one of two forms (not both):
    - `book` plus optional `startChapter` / `startVerse` / `endChapter` / `endVerse`
    - `refs` — semicolon-separated ranges, same format as in `get-it`

Output example: `ROM 1:1; 1:9; 1:16; 2:16; 10:16` — one entry per verse, in
canonical order, book omitted when it repeats. Empty if no verses match.

References use original-language (Hebrew/Greek) verse numbering, which differs
from some translations in a few places (e.g. Hebrew Malachi 3:19 = English 4:1).

### `get-rendering`

Returns how a project renders a Biblical Term, from the project's `TermRenderings.xml`.

- `project` — project id (folder name)
- `id` — term id from `list-bt` (including any `-1`, `-2` suffix)

Output is the project's renderings exactly as entered in Paratext's Biblical Terms
tool, e.g. `Akam* Aghuuŋ*` for εὐαγγέλιον. `*` is a wildcard for any word ending or
beginning, and `||` separates alternative renderings
(`Galilin distrigh*||Galilin Rɨm*`). Empty if the term has no renderings yet.

See `src/md/bt/bt_spec.md` for details of the Biblical Terms data layout.

## Development

```bash
npm install
npm run build   # compile TypeScript to dist/
npm test        # run the Vitest suite (uses the myParatextProjects/ fixture data)
```

Tests read Paratext project data from the `myParatextProjects/` folder and the
Biblical Terms list from `myParatext/Lists/`. Tests that need git-ignored data
(`AKG-Uni`, `myParatext/Lists`) are skipped when it is not present.

## Acknowledgements

Special thanks to [unfoldingWord](https://www.unfoldingword.org/) for [usfm-js](https://github.com/translationCoreApps/usfm-js), the USFM parser this project relies on.

## To Do
- Provide auto install, e.g. 'npx @milesnl/ptx-mcp --install'
- Try out with Gemini CLI etc.
