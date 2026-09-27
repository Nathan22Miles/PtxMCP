Need to improve how we generate interlinear text.

Many of the words do not have a gloss because the interlinear xml
files only contain glosses that have been specifically approved by a human
in that verse.

This means many of the words in a verse may not currently have a gloss.

Return a "best effort gloss" for all the words in a verse by doing the following.

Read all the files in the interlinear_<lang> follow for each word form
found in any of the files record the most commonly used gloss.

To gloss a verse do the following
- Read the verse text for the verse
- Split the verse into words
- For each word
    - If the interlinear_<lang> file entry contains a gloss for this word use it
    - Otherwise supply the most common gloss for this word if it has been glossed
    - Otherwise find the word in the Form field of lexicon.xml and use the gloss of the first sense
    - Othwerwise just '_' if the word has never been glossed

# Spec (decisions from review)

Changes `get-it` (see `it_spec.md` §4, §6, §7). Supersedes those sections where they conflict.

## Corpus: most common gloss per word form
- Source: all `Interlinear_<lang>_*.xml` files in `Interlinear_<lang>` folder (all books).
- Count only Word clusters (single `Word:` lexeme), not Excluded, not Phrase, not Stem/affix.
- Include stale clusters (range no longer matches text); analysis still valid for the form. No USFM read needed.
- Key: lowercased NFC form (from `Word:<form>`).
- Value counted: resolved gloss text (lexicon lookup of `GlossId`). Clusters with no `GlossId` or unknown sense not counted. Different sense ids with same gloss text count together.
- Most common gloss wins. Tie → first seen (book canon order, then file order).
- Build once per language; cache; rebuild if any file in folder changes (mtime) or lexicon changes.

## Glossing a verse
1. Verse text = raw USFM segment (as today, LF-normalized; offsets still relative to segment).
2. Only verse text is tokenized. Skip:
    - USFM markers themselves (`\p`, `\v 1`, `\q1`, `\wj`, `\wj*`, ...)
    - footnotes `\f … \f*`, cross-refs `\x … \x*`
    - heading paragraphs inside segment (`\s#`, `\ms#`, `\mr`, `\r`, `\sr`) to end of line
3. Word = maximal run of Unicode letters + combining marks (`[\p{L}\p{M}]+`). Everything else (spaces, punctuation, digits, apostrophes, hyphens) separates words. Numbers not emitted.
4. For each token (text order), keep `index`/`length` in segment:
    - **Approved**: interlinear item for verse has a Word cluster with exactly that `Index`/`Length`, form == lower(token), not Excluded, and gloss resolves → that gloss, source `a`.
    - Else **guess**: corpus most common gloss for lower(token) → source `g`.
    - Else **lexicon**: `lexicon.xml` entry whose `Form` == lower(token) (NFC, case-insensitive); `Type="Word"` entries win over other types (Stem, ...); first sense whose `Gloss Language` == requested language and non-empty → source `l`.
    - Else `_`, source `-`.
5. Stale clusters (range doesn't match a token) ignored for this verse (only feed corpus).
6. Stem/affix-only analyses ignored for this verse → token gets guess.
7. Phrase clusters still ignored.
8. Word emitted with text spelling/case (`Kɨ`).

## Output
- Default: `[word, gloss]` pairs as today; gloss `_` when never glossed (no more `null`).
- New optional param `showSource: boolean` (default false): each word becomes `[word, gloss, source]`, source ∈ `a` (approved in this verse), `g` (guessed from corpus), `l` (first sense of matching lexicon entry), `-` (never glossed).

```json
[{"ref":"ROM 1:1","words":[["Kɨ","I","a"],["Pol","Paul","a"],["xyz","_","-"]]}]
```

## Missing data (replaces table rows in it_spec.md §7)
| Condition | Behavior |
|---|---|
| no `Interlinear_<lang>` folder | error unless `allowPartial` → words from tokenization with gloss `_`, source `-`; listed in `missing` |
| folder exists, no file for this book | no error; all words guessed from other books |
| verse has no interlinear item | no error; all words guessed |
| approved Word cluster, `GlossId` missing / not in lexicon | fall back to guess |

Other rows (unknown project, no USFM, invalid ref) unchanged.

## Decision changes vs it_spec.md §6
- "Stale Word clusters: emit `[form, gloss]`" → ignored; token guessed.
- "Stem/affix-only words: `[word, null]`" → guessed.
- "Unanalyzed text words: omitted" → included (guessed or `_`).
- "Verse with no interlinear item: `words: []`" → all words guessed.

## Notes
- `\d` (Psalm titles) inside verse segment: skip
- `\w word|attrs\w*`: tokenize `word`, skip `|attrs`
- Should `get-it` corpus include glosses from other gloss languages' folders: No
