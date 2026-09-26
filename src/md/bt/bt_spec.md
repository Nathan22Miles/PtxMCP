# Biblical Terms List Data Layout

Source: `myParatext/Lists/BiblicalTerms.xml` — Paratext's standard "Major Biblical Terms" list (shared, not project-specific). ~7 MB, ~204k lines, 8,654 terms, 106,026 verse references. Schema: `myParatext/Lists/BiblicalTerms.xsd`. UTF-8 with BOM.

Too large to read ad hoc: parse once, cache (mtime check like interlinear).

## Structure

```xml
<BiblicalTermsList xmlns:xsi=".." xmlns:xsd="..">
  <Term Id="εὐαγγέλιον">
    <Strong>G2098</Strong>
    <Transliteration>euangelion</Transliteration>
    <Category>MI</Category>
    <Domain>communication</Domain>
    <Language>greek</Language>
    <Definition>the content of good news about Jesus</Definition>
    <Gloss>good news; gospel</Gloss>
    <Link>realia:1.2.3</Link>          <!-- optional -->
    <References>
      <Verse>04500100100018</Verse>     <!-- ROM 1:1, word 9 -->
      ...
    </References>
  </Term>
  ...
</BiblicalTermsList>
```

## `<Term>`

| Element | Count | Notes |
|---|---|---|
| `@Id` | 8654, all unique | Lemma in original script (Hebrew/Aramaic/Greek). Homographs get `-N` suffix: `אֲבִיָּה-1`, `אֲבִיָּה-2` (different people/senses). ~2,660 Ids have a suffix. Key for lookups; non-ASCII. |
| `Strong` | 8654 | Strong's number(s): `H0005`, `G2098`, `A####` (Aramaic), letter-suffixed `H0021a`, or comma list `G1234, G5678`. **Empty/whitespace in 1,828 terms.** |
| `Transliteration` | 8654 | Latin transliteration, e.g. `euangelion`. Useful ASCII-ish search key. |
| `Category` | 8654 | Code, see below. Exactly one per term. |
| `Domain` | 8057 (optional) | Semantic domain(s), free text, `;`-separated, e.g. `containers; animal husbandry`. |
| `Language` | 8654 | `hebrew` (4953), `greek` (3655), `aramaic` (46). Lowercase. |
| `Definition` | 8654 | English definition sentence. |
| `Gloss` | 8654 | English gloss(es), separated by `;` or `,`, e.g. `good news; gospel`. |
| `Link` | 1299 (optional) | `<kind>:<section>` into FAuna/FLora/REalia handbooks: `realia` 813, `fauna` 315, `flora` 171. |
| `References` | 8654 | ≥1 `<Verse>`. |

### Category codes
Names from `BiblicalTermsEn.xml` `<Categories>`:

| Code | Name | Count |
|---|---|---|
| PN | Name (people, places) | 5724 |
| RE | Realia | 886 |
| AT | Attributes | 629 |
| MI | Miscellaneous | 491 |
| FA | Fauna | 310 |
| BE | Beings | 253 |
| FL | Flora | 202 |
| RI | Rituals | 159 |

Note: no `KT` (Key Term) category in this list, although interlinear phrase glosses reference `[KT: …]`. εὐαγγέλιον is `MI`.

## `<Verse>` reference encoding

14 digits: `BBB CCC VVV WWWWW`

| Part | Digits | Meaning |
|---|---|---|
| `BBB` | 1–3 | Book number, Paratext canonical order: 001 GEN … 039 MAL, 040 MAT … 066 REV, 067+ deuterocanon (077 = 1MA). Range in file: 001–081. |
| `CCC` | 4–6 | Chapter |
| `VVV` | 7–9 | Verse |
| `WWWWW` | 10–14 | Word position in the original-language verse × 2 (always even; ROM 1:1 εὐαγγέλιον = 9th Greek word → `00018`). |

Example: `04500100100018` → ROM 1:1, word 9.

Book number ↔ code: index into full Paratext canon list (1-based). Note project file names use a different numbering (`46ROM`, `781MA`: NT +1, skips 40); don't derive from file names.

Oddities:
- One ref has a suffix: `01100401900012{N:001}` (1KI 4:19). Parse first 14 chars; ignore suffix.
- 15 terms repeat the same `<Verse>` (e.g. `אֶבֶן-2` has `03800300900008` twice). Dedupe.
- Verse numbering follows original-language (Hebrew/Greek) versification, not necessarily the project's (e.g. Hebrew Malachi 3:19–24 = English 4:1–6). Mapping requires versification files (`*.vrs`); out of scope unless needed.
- A term can occur several times in one verse (different word positions). For verse-level output, collapse to unique `BBBCCCVVV`.
- `יהוה` has 6,828 refs; responses may need limiting.
- Ids are **not NFC-normalized**: e.g. `εὐαγγέλιον` uses U+1F73 (epsilon with oxia), which NFC turns into U+03AD (tonos). A client-supplied Id may differ in code points from the file. Compare Ids after normalizing both sides (NFC).

## Lookup indexes to build
- `Id → Term`
- `Transliteration` (lowercased, diacritics stripped) → Id[] (for search)
- `Strong` (each value) → Id[]
- `Gloss` words (lowercased) → Id[] (for "what is the term for 'gospel'")
- per term: ordered unique verse refs `{book, chapter, verse}`


# Decisions (v1)
- Source: global `BiblicalTerms.xml` only. Project term lists (`ProjectBiblicalTerms.xml`, `TermRenderings.xml`) not used.
- File location: default = Paratext install dir; fallback = repo `myParatext/Lists/BiblicalTerms.xml` (dev/tests). Startup override: see To Be Added.
    - Candidates (verify, see Open questions): Windows `C:\Program Files (x86)\Paratext 9\Terms\Lists\BiblicalTerms.xml`, `C:\Program Files\Paratext 9\Terms\Lists\BiblicalTerms.xml`.
    - Not found anywhere → tools error with message naming paths tried.
- Versification: refs returned as-is (original-language versification). No mapping to project versification in v1.
- Deuterocanon: add missing codes to `BOOK_CODES` (`src/books.ts`) so refs in books 067–081 (e.g. 1MA) map to codes and work in `get-it`/`get-scripture`.
- Parse once, cache with mtime check.

## Book number ↔ code
`BBB` = 1-based index into Paratext canon order. Full list needed (at least 001–081):
```
001–039 GEN … MAL
040–066 MAT … REV
067 TOB  068 JDT  069 ESG  070 WIS  071 SIR  072 BAR  073 LJE  074 S3Y
075 SUS  076 BEL  077 1MA  078 2MA  079 3MA  080 4MA  081 1ES
```
(067+ per Paratext canon; confirm against Paratext `Canon` list when implementing.)

# MCP commands

Added alongside existing commands.

## `list-bt`

Search the Biblical Terms list.

Input:
- `search`: string, required
- `book`: optional 3-letter code; only terms with ≥1 ref in that book

Matching:
- Normalize query and fields: lowercase, Unicode NFD, strip combining marks (diacritics), so `euangelion`/`euangelión` and Greek/Hebrew without accents/points match.
- Term matches if normalized query is a substring of any of: `Gloss`, `Id` (suffix `-N` included), `Transliteration`, `Definition`.
- Or: query equals (case-insensitive) one of the term's `Strong` values (split on `,`), e.g. `G2098`, `h0021a`.
- Empty/whitespace query → error.
- No ranking, no limit: all matches, file order.

Output: JSON array, one object per term (`id` returned exactly as in file):
```json
[
    { "id": "εὐαγγέλιον", "gloss": "good news; gospel", "transliteration": "euangelion",
      "language": "greek", "category": "MI", "strong": ["G2098"], "refCount": 73 }
]
```
- `strong`: array (empty if none).
- `refCount`: number of unique verses (after dedupe, all books; not restricted by `book` filter).
- No word positions, no definition, no refs.

## `get-bt-refs`

Verse references where a term occurs, formatted for `get-it`'s `refs` param.

Input:
- `id`: Term Id, exact match incl. `-N` suffix (from `list-bt`), compared after NFC normalization of both sides. Unknown → error.
- Optional filter, at most one of (error if both):
    - **Structured**: `book` + optional `startChapter`, `startVerse`, `endChapter`, `endVerse` (same meaning as `get-scripture`)
    - **List**: `refs`: semicolon-separated ranges (grammar below)
    - Omit both → all refs of the term.

Filtering: purely numeric on `book/chapter/verse`; no project, no USFM, no bridge handling.
- Structured: same defaults as `get-scripture` — `book` only = whole book; `startChapter` only = that chapter; `endChapter` defaults to `startChapter`; missing `startVerse` = from verse 1; missing `endVerse` = to end of `endChapter` (unbounded; no USFM needed).
- `refs`: ref kept if inside any listed span.

Processing:
1. Parse term's `<Verse>` values: first 14 chars; ignore suffix like `{N:001}`.
2. Drop word position; dedupe to unique `(book, chapter, verse)`.
3. Book number → code (§ Book number ↔ code). Unknown number → skip.
4. Apply filter.
5. Sort canonical order (book number, chapter, verse). (Request order not relevant: output is term's refs.)

Output: single `refs` string, one entry per verse, book omitted when same as previous entry, directly usable as `get-it` `refs`:
```
ROM 1:1; 1:9; 1:16; 1CO 9:14; 9:18
```
- Always `C:V` form (never bare chapter; bare number would mean whole chapter in `get-it`).
- No matches → empty string (not an error).
- No limit (`יהוה` ≈ 6.8k verses).

#### `refs` grammar (filter)
Same as `get-it` (`src/interlinear.ts` `parseRefs`):
```
refs  := ref ( ";" ref )*          whitespace around ";" and inside ref ignored
ref   := [BOOK " "] span
span  := C                         whole chapter          ROM 2
       | C ":" V                   one verse              ROM 1:1
       | C ":" V "-" V2            verses in one chapter  ROM 1:3-5
       | C ":" V "-" C2 ":" V2     across chapters        ROM 1:30-2:2
BOOK  := 3-letter USFM code (case-insensitive)
```
- First ref must have a book; later refs without a book reuse previous ref's book.
- Unparseable ref / invalid book code → error.

# To Be Added
- Allow specifying the location of the Biblical Terms list at server startup

# Open questions
- Exact Paratext install location of `BiblicalTerms.xml` on Windows (and Linux, e.g. `/usr/lib/paratext9/...`)? Need confirmation from a Paratext install.
- Canon order for 067–081 to confirm against Paratext.
