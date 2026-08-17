---
name: wiki-ingest
type: Note
description: >-
  Ingest / distill a raw note into Open LLM Wiki (Source → Summary + Entity/Concept).
  Use when the user says 提炼、消化、ingest、distill into wiki, or points at an
  Unprocessed/untyped source note. Prefer open-llm-wiki MCP tools.
---

# wiki-ingest

Turn one **raw** note into typed wiki pages. Spec: Open LLM Wiki workflow §1 (ingest) + consolidate.

## Prerequisites

1. Vault is an Open LLM Wiki vault (has `types/` or `index.md` with OWF conventions).
2. **Tools**: prefer MCP server `open-llm-wiki` —
   `read_note`, `write_note`, `search_notes`, `run_qql`, `links`, `lint_vault`, `vault_info`.
   Fall back to direct filesystem only if MCP is unavailable; still respect the same rules.
3. **Input**: vault-relative path to the note (argument or user message).

## Procedure

### 1. Orient

- `read_note` the target path (use graph brief).
- If frontmatter has **no `type`** or type is empty: treat as raw material → set `type: Source` and `status: Unprocessed` before/with digest bookkeeping.
- If `type` is already `Summary` / `Entity` / `Concept` / `Query` / `Type` / `Note`: **stop** and tell the user this is not a raw source (do not invent a second Summary).

### 2. Distill into four slots (do not collapse into one bland paragraph)

| Slot | Destination |
|------|-------------|
| Facts | Summary: `## TL;DR` / `## Key points` / `## Quotes` (quotes with attribution) |
| Decisions + rationale | Concept and/or Entity pages |
| Lessons | Concept (optional tag `lesson`) |
| Todos / open gaps | `index.md` Open gaps only — never as settled claims |

### 3. Write pages

**Summary** (new or update Active one for this source):

```yaml
type: Summary
status: Active
source: "[[Title of the source note]]"
generated: YYYY-MM-DD
provenance: agent
# reviewed: leave empty (write ≠ review)
```

**Entity / Concept** as needed. In Summary body and/or `mentions:`, `[[wikilink]]` to them.
Do **not** hand-fill `mentioned_in` (graph computes reverse links).

**Source bookkeeping** on the raw note:

```yaml
type: Source
status: Digested
derived_into: "[[Summary title]]"
# evidence_tier / last_verified if missing
```

If writing `contradicts:` on a Concept, set the **refuted** Concept to `status: Contested`.

On every new/updated wiki page (soft fields, fill only if missing):

- `provenance: agent`
- `reviewed:` empty
- optional `trust: 0-3`

### 4. Register + consolidate

- Add one-line entries for new pages in `index.md`.
- `write_note` returns `broken_links` / `orphan_hint` — fix immediately.
- Run consolidate: `lint_vault` and/or Health QQLs under `health/*.md` via `run_qql`; note open gaps.

## Done when

- [ ] Note is `type: Source` + `status: Digested` + `derived_into`
- [ ] At least one Active Summary with `source` pointing back
- [ ] Mentions/wikilinks in place
- [ ] Four slots considered (empty slot OK; say so)
- [ ] One consolidate pass done

## Anti-patterns

- Dumping full agent transcripts into the vault
- Auto-changing `status` from lint without human judgment beyond Contested bookkeeping above
- Creating near-duplicate Concepts without `search_notes` / `run_qql` first
