---
name: "paratext-term-renderings"
description: Research and compile Biblical Term renderings from a Paratext project via the ptx-mcp connector. Use this skill whenever the user explicitly asks about Paratext term renderings — e.g. "find/get the rendering for [a Greek/Hebrew term]", "what references are denied for [a term]", "which references don't have a matching rendering", "fetch the interlinear to find a rendering", or asks to compile renderings into Paratext's TermRenderings encoding (word* wildcards, || between alternatives). Do not trigger for general Bible-study or translation questions that don't reference Paratext, term renderings, or the ptx-mcp tools.
---

# Paratext Term Renderings Researcher

A skill for looking up how a Biblical Term (Greek/Hebrew) is rendered in a specific Paratext project, tracing down references that lack a recorded rendering, and presenting findings clearly — including in Paratext's own TermRenderings encoding.

## Tools used (ptx-mcp, via tool_search)

- `list-bt` — search the Biblical Terms list by transliteration, gloss, or Greek/Hebrew string. Always do this first to get the exact term `id`. If more than one candidate term is returned, stop and have the user pick before calling any other tool — see step 1 of the Workflow below.
- `get-rendering` — returns the recorded rendering(s) for a term id in a given project, as a `||`-separated string, plus any `denials` (references explicitly marked as NOT using the recorded rendering for that verse).
- `get-bt-refs` — returns every Scripture reference where the term occurs (per the original-language Biblical Terms data, not per-project).
- `get-scripture` — fetch verse text for a project. Note: omitting `endVerse` returns through the end of the chapter, so always pass `endChapter`/`endVerse` explicitly when you want a single verse.
- `list-it` / `get-it` — list available interlinear gloss languages for a book, then fetch word-by-word interlinear glosses for specific references.

## Workflow

1. **Resolve the term — disambiguate before doing anything else.** Call `list-bt` with the term (transliteration, gloss, or Greek/Hebrew — including English glosses like "condemnation" or "household slave"). This is always the first tool call; do not call `get-rendering`, `get-bt-refs`, `get-scripture`, or `get-it` until a single term id is settled.
   - **Exactly one result:** proceed with it directly, no need to ask.
   - **Zero results:** try a related/simpler search term (e.g. drop a modifier word, try a near-synonym). If still nothing, tell the user plainly that no matching Biblical Term was found — don't force a distant match.
   - **More than one plausible result:** stop and ask the user to choose before doing any further lookups. Present each candidate's id, gloss, language, and reference count (e.g. via `ask_user_input_v0` if available, otherwise as a numbered list in the reply) so the user can pick by meaning rather than by raw id string. This includes near-duplicate ids (`δοῦλος-1` vs a related compound term) and cases where the search returns several distinct Greek/Hebrew words that could all plausibly match an English gloss (e.g. searching "condemnation" surfaces κατάκριμα, κατάκρισις, καταδίκη, κρίμα, κρίσις-1 — these are different words with different nuances, not interchangeable, so don't guess or silently analyze all of them as a bundle unless the user explicitly asks for a comparison across several terms).
   - Only after the user has picked one term (or there was an unambiguous single match) do you move to step 2 and actually analyze it.
2. **Get the recorded rendering.** Call `get-rendering` with the id and project. Report the rendering string and any `denials` (references where the standard rendering was explicitly rejected for that verse).
3. **Get all references.** Call `get-bt-refs` for the term id. This is the full reference list regardless of project.
4. **Check references against the rendering (only if asked).** If the user wants to know whether every reference actually contains the recorded rendering:
   - Fetch each reference's verse text via `get-scripture` (one call per reference, with explicit `endChapter`/`endVerse` to avoid over-fetching a whole chapter — or batch same-book/chapter refs where the tool allows a range).
   - Scan the text for the recorded rendering's word-forms (accounting for the `*` wildcard — e.g. `maghatɨgh*` matches `maghatɨgha`, `maghatɨghan`, etc.).
   - Flag references where none of the recorded forms appear.
5. **Interlinear fallback for unmatched references.** For any reference that doesn't contain the recorded rendering, fetch the interlinear gloss via `get-it` (check `list-it` first for the available gloss language) to see whether the concept is rendered by a different word/phrase, or handled periphrastically (via contrast, negation, or paraphrase rather than a discrete lexical item). Say plainly when no discrete rendering is found — don't force a match.
6. **Compile output.** Default to giving both:
   - A **readable table**: word/phrase found → references where it occurs (normalize minor morphological/case variants into one row where they're clearly the same lexeme; note this normalization to the user).
   - A **Paratext-encoded rendering string**: `word*||word*||...`, using `*` for the optional suffix portion and `||` to separate distinct alternative renderings. Build this from the readable table's distinct lexeme entries, not from every raw inflected form.

## Notes on scope and judgment calls

- "Denied" references (from `get-rendering`'s `denials` field) are a distinct concept from "references lacking a rendering" (discovered by manually checking verse text) — don't conflate them in output.
- When a rendering is conveyed periphrastically (e.g. through grammatical contrast rather than a specific word), say so explicitly rather than picking the nearest word and calling it "the rendering."
- Batch `get-scripture`/`get-it` calls per book where possible to reduce round trips, but don't request more verses than needed (watch the `endChapter`/`endVerse` defaulting-to-end-of-chapter behavior).
- If the user asks for interlinear output formatted a specific way (e.g. "surface form only", "alternating rows"), match that formatting exactly rather than defaulting to the full three-line interlinear layout.
