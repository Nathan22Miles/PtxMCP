# Data Layout

Interlinear glosses come from three files in a project folder (example: `myParatextProjects/AKG-Uni`). Target output per verse: ordered list of `[vernacularWord, gloss]` pairs (see `it_rom_1.1.json`).

| File | Role |
|---|---|
| `Interlinear_<glossLang>/Interlinear_<glossLang>_<BOOK>.xml` | Per-book analysis: which text ranges map to which lexeme + chosen sense |
| `lexicon.xml` | Project lexicon: lexemes → senses → gloss text (one per sense) |
| Book USFM file (e.g. `46ROMAKG-Uni.SFM`) | Verse text; interlinear ranges are character offsets into it |
| `InterlinearSetup.xml` | Lists configured gloss languages (optional; folder listing is enough) |

## 1. Interlinear file

Path: `<project>/Interlinear_<glossLang>/Interlinear_<glossLang>_<BOOK>.xml`
- `<glossLang>`: e.g. `en`, `en-US`. One folder per gloss language; one file per book (3-letter book code).

```xml
<InterlinearData GlossLanguage="en" BookId="ROM">
  <Verses>
    <item>
      <string>ROM 1:1</string>              <!-- verse ref key -->
      <VerseData Hash="0C226435">           <!-- Hash optional -->
        <Cluster>
          <Range Index="5" Length="2" />
          <Lexeme Id="Word:kɨ" GlossId="258Voebn" />
        </Cluster>
        <Cluster>
          <Range Index="16" Length="6" />
          <Lexeme Id="Stem:gen" GlossId="/I2hBGcI" />
          <Lexeme Id="Suffix:msua" GlossId="jWL8IoJm" />
        </Cluster>
        <Cluster>
          <Range Index="125" Length="18" />
          <Lexeme Id="Phrase:mbɨsevisi gumaghan" GlossId="/uZzD9+r" />
        </Cluster>
        ...
```

### `<item>` (one per verse)
- `<string>`: ref `"<BOOK> <chapter>:<verse>"`.
  - Verse may be a bridge: `ROM 1:9-10`.
  - Verse `0` = text before `\v 1` in that chapter (headings etc.). For chapter 1, `<BOOK> 1:0` starts at the very beginning of the book (`\id` line), so it also covers book intro/titles.
- Items are **not** in canonical order (ROM 1:2 precedes ROM 1:1). Find by ref.
- Not every verse has an item (only verses that have been glossed).

### `<VerseData>`
- `Hash` attr: optional, present on few items. Apparently a hash of verse text at analysis time. Not needed; does not guarantee ranges are current (ROM 1:2 has one and is stale).
- Children: `<Cluster>` elements, **unordered** (not by position, not by type). Must sort by `Range/@Index`.

### `<Cluster>`
- `<Range Index Length>`: character span in verse text (see §3).
- One or more `<Lexeme>`:
  - `Id="<Type>:<form>"`. Type ∈ `Word`, `Stem`, `Suffix`, `Prefix`, `Phrase`. Form is lowercased; may contain spaces (Phrase).
  - `GlossId`: sense id in `lexicon.xml`. **Optional** (missing = unglossed).
- Optional `<Excluded>true</Excluded>`: analysis rejected by user; skip cluster.

### Cluster kinds (same text span can have several)
| Kind | Lexemes | Use |
|---|---|---|
| Word | single `Word:` | **Whole-word gloss — this is what the target output uses** |
| Morpheme | `Stem:` (+ `Prefix:`/`Suffix:`) | Morpheme breakdown, glosses like `1sg.NOM`, `-OBL.sg`. Out of scope |
| Phrase | single `Phrase:`, spans several words | Out of scope — ignore |

Example ROM 1:1 at Index 16: `Word:gemsua` → "for you.pl"; `Stem:gen`+`Suffix:msua` → "2pl.OBL" "-PURP".

Oddities:
- Word may lack a Word cluster but have a Stem cluster (and vice versa).
- Duplicate/stale clusters for one span: ROM 1:1 Index 161 has `Stem:nan` (stale) and `Word:nam` (current). Choose the cluster whose form matches the text.

## 2. lexicon.xml

```xml
<Lexicon>
  <Language>spm</Language>
  <FontName>..</FontName><FontSize>..</FontSize>
  <Analyses />
  <Entries>
    <item>
      <Lexeme Type="Word" Form="kɨ" Homograph="1" />
      <Entry>
        <Sense Id="258Voebn">
          <Gloss Language="en">I</Gloss>
        </Sense>
        <Sense Id="8xIoqeaC">
          <Gloss Language="en-US">I</Gloss>
        </Sense>
        <Sense Id="HKU5umyA">
          <Gloss Language="en">touched</Gloss>
        </Sense>
      </Entry>
    </item>
```

- `<item>` = lexeme (`Type` + `Form` match the interlinear `Lexeme/@Id` `<Type>:<form>` exactly) + its senses.
- `<Sense Id>` = target of interlinear `GlossId`. Each sense has exactly one `<Gloss Language>`. A lexeme mixes senses of all gloss languages.
- The gloss the user picked for a text word is `GlossId`, not "first sense".
- Sense ids: 8-char base64-like strings (may contain `/`, `+`). Almost globally unique; a few junk ids (`0`, `1`, `2`) are reused across lexemes. Safe lookup key: `(Type, Form, SenseId)`; `SenseId` alone works for real ids.
- Some `GlossId`s (11 in ROM) have no sense in lexicon → treat as unglossed.
- Large (~130k lines): parse once, build map `senseId → gloss` (or keyed as above), cache.
- Glosses are lowercase in lexicon (`you`, `who (he) chose`); `it_rom_1.1.json` capitalization comes from the display only. Returned as-is (§6).

## 3. Verse text / Range offsets

Book file: name from `Settings.xml` `<Naming PrePart="" PostPart="AKG-Uni.SFM" BookNameForm="41MAT" />` → `46ROMAKG-Uni.SFM`. (Existing `usfmBook.ts` already indexes book files.)

`Range/@Index` = offset into raw USFM of the verse segment:
- Normalize line endings to `\n` first (files are CRLF; offsets assume LF).
- Verse segment for `C:V` starts at its `\v V` marker (offset 0 = `\`) and runs up to the next `\v` or `\c` marker. Markers inside (e.g. `\p`, `\q`) count as characters.
- Segment `C:0` starts at `\c C` (chapter 1: at start of file) and ends at `\v 1`.
- Offsets count UTF-16 code units (== JS string index; all chars seen are BMP).
- Must use raw USFM, not the normalized text from `parseBookFile`.

ROM 1:1 check: segment `\v 1 Kɨ Pol, kɨ …` → Index 5 Len 2 = `Kɨ`, Index 8 Len 3 = `Pol`.

Staleness: if text was edited after glossing, ranges drift. In ROM ~98% of Word clusters match; mismatches concentrated in edited verses (ROM 1:2: all wrong). Validate: `text.substr(Index, Length).toLowerCase() === form`. Non-matching Word clusters handled per §4 rule 5b.

## 4. Algorithm: verse → `[word, gloss]` pairs

> Superseded by `it_update1.md` (best-effort glossing of every word). §4 and §6 below describe v1.

```
input: project, glossLang, book, one verse ref (from range expansion, §7)
1. xml = Interlinear_<glossLang>/Interlinear_<glossLang>_<book>.xml (parse once, cache)
   item = item whose <string> ref covers the verse (bridge: "ROM 1:9-10" covers 9 and 10)
   none → { ref, words: [] }
2. seg = raw USFM segment for item's ref (LF-normalized)
3. drop clusters that are Excluded or contain a Phrase lexeme
4. group remaining clusters by Range (Index, Length)
5. per group pick one entry:
     a. Word cluster whose form == lower(seg.substr(Index, Length))
          → [textSlice, gloss]                    (current)
     b. else any Word cluster
          → [form, gloss]                         (stale: text edited since glossing)
     c. else Stem/affix cluster only
          → [textSlice, null]                     (analyzed, no whole-word gloss)
6. sort by Index; output words
gloss = lexicon sense[GlossId] gloss text, as-is; no GlossId / unknown sense → null
```
- Current word: use text's spelling/case (`Kɨ`). Stale word: lowercased form from XML.
- Stale ordering uses stale Index; may interleave imperfectly with current words. Accepted.
- Stale groups can't be detected for stem-only clusters (stem form ≠ surface form); slice used as-is.
- Stale Word cluster may share a span with a current one (ROM 1:1 Index 161: `Stem:nan` stale, `Word:nam` current) → rule 5a wins.
- Words in text with no cluster: not emitted.

ROM 1:1 via this algorithm reproduces `it_rom_1.1.json` (34 pairs), except gloss capitalization (lexicon is lowercase).

## 5. Other notes
- `InterlinearSetup.xml`: `<InterlinearSetup type="Glossing" language="en">` per gloss language (plus model text settings; irrelevant here). Available languages can also be found by listing `Interlinear_*` folders.
- ROM file stats: 411 verse items, 2498 clusters; lexeme types: Word 1082, Stem 1371, Suffix 515, Phrase 51.

## 6. Decisions (v1; may expand later)
- Gloss text returned as-is from lexicon (no case mirroring).
- Stale Word clusters: emit `[form, gloss]` (§4 rule 5b).
- Stem/affix-only words: `[word, null]` (no morpheme gloss joining).
- Unanalyzed text words (no cluster): omitted.
- Phrase clusters: ignored.
- Verse bridges: request for any verse in a bridge returns the bridged item once, ref `ROM 1:9-10`.
- Verse 0 (headings, intro): never returned.
- Verse with no interlinear item: returned with `words: []`.
- Single project per call.
- `get-it` has `allowPartial` like `get-scripture` (§7).
- `get-it` accepts either structured range or `refs` list (§7).

## 7. MCP commands

Added alongside existing `list-projects`, `list-books`, `get-scripture` (`src/server.ts`).

### `list-it`
Input:
- `project`: project id
- `book` (optional): only languages that have `Interlinear_<lang>_<book>.xml`

Source: `Interlinear_<lang>` folders in project dir (not `InterlinearSetup.xml`). Output: one language code per line (e.g. `en`, `en-US`). Error if project missing.

### `get-it`
Input:
- `project`: project id
- `language`: gloss language code, e.g. `en`
- Reference: exactly one of these two forms (error if both or neither)
    - **Structured** (mirrors `get-scripture`):
        - `book`: 3-letter code
        - `startChapter`, `startVerse`, `endChapter`, `endVerse`: optional, same semantics/defaults as `get-scripture` (omit all = whole book)
    - **List**: `refs`: string, semicolon-separated verse references (grammar below)
- `allowPartial`: optional boolean, default false. Tolerate missing data instead of erroring (table below)

#### `refs` grammar
```
refs  := ref ( ";" ref )*          whitespace around ";" and inside ref ignored
ref   := [BOOK " "] span
span  := C                         whole chapter          ROM 2
       | C ":" V                   one verse              ROM 1:1
       | C ":" V "-" V2            verses in one chapter  ROM 1:3-5
       | C ":" V "-" C2 ":" V2     across chapters        ROM 1:30-2:2
BOOK  := 3-letter USFM code (case-insensitive)
```
- First ref must have a book; later refs without a book reuse previous ref's book (`ROM 1:1; 3:5; MAT 5:3; 6:1` → ROM 1:1, ROM 3:5, MAT 5:3, MAT 6:1).
- Multiple books allowed in one call.
- Each ref expands exactly like the structured form for that span.
- Output order = order of refs in request; within a ref, canonical order.
- Duplicate verses (overlapping refs, or two verses in one bridge) emitted once, at first occurrence.
- Unparseable ref / invalid book code → error (not relaxed by `allowPartial`).

Range expansion (both forms): use verses from the book's USFM (same as `get-scripture`), skip verse 0, collapse verses in one bridge to a single entry.

Output: JSON text
```json
[
    { "ref": "ROM 1:1", "words": [["Kɨ", "I"], ["Pol", "Paul"], ...] },
    { "ref": "ROM 1:2", "words": [...] }
]
```

Errors (like `get-scripture`), relaxed by `allowPartial`:

| Condition | default | `allowPartial: true` |
|---|---|---|
| unknown project | error | error (single project; nothing to return) |
| no USFM for book | error | structured form: error (can't expand range). `refs`: omit that book's refs, list in `missing` |
| invalid range / verse not in text | error | omit those verses, list in `missing` |
| no `Interlinear_<language>` folder, or no interlinear file for book | error | return verses with `words: []`, list in `missing` |
| verse has no interlinear item | `words: []` | `words: []` (not listed in `missing`) |

`missing` reporting mirrors `get-scripture`, but keeps JSON parseable: JSON array is first text content item; if anything missing, second text content item `[missing: ...; ...]`.

## Open questions
- `refs` output order: request order (spec) or canonical sort?
- `refs`: also allow later refs to reuse chapter (e.g. `ROM 1:1; 5` = ROM 1:5)? Spec: no — bare number = whole chapter.
- `refs`: support comma lists (`ROM 1:1,3,5`)? Spec: no.
