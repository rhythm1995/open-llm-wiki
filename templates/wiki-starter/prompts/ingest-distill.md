---
type: Note
---

# Prompt: ingest a Source (distill L2a) — fallback

> **Preferred:** use the vault skill **wiki-ingest**  
> (`.agents/skills/wiki-ingest/SKILL.md` or `.claude/skills/wiki-ingest/SKILL.md`).  
> Install/upgrade skills: `npx open-llm-wiki-skills install .`  
> This file is a **fallback** long prompt if the skill is missing.

> Copy into an external agent (MCP) or the in-app agent (ACP).  
> Workflow: skill wiki-ingest / docs/14 §1.  
> Replace `<SOURCE_PATH>` with the vault-relative path of the Source note.

---

Please run skill **wiki-ingest** (or the checklist below) on this Source.

**Source path:** `<SOURCE_PATH>`

## Hard constraints

1. **Raw transcripts stay out of the vault.** Only distill into typed wiki pages (Summary / Entity / Concept). Do not dump full agent SQLite transcripts.
2. **Four slots** (do **not** collapse into a single bland summary):
   - **Facts** → Summary: `## TL;DR` / `## Key points` / `## Quotes` (quotes with attribution)
   - **Decisions + rationale** → Concept pages (claims) and/or Entity profile updates
   - **Lessons** → Concept pages (optional tag `lesson`)
   - **Todos / open gaps** → `index.md` Open gaps only; never present as settled claims
3. **Frontmatter** on every new/updated page (soft fields; fill defaults only if missing — never overwrite):
   - `provenance: agent`
   - `reviewed:` leave empty (`write ≠ review`; human fills `YYYY-MM-DD` later)
   - optional `trust: 0-3`
4. **Source bookkeeping:** set Source `status: Digested`, `derived_into: "[[summary]]"`; Summary must have `source: "[[this-source]]"`, `status: Active`, `generated: <today>`.
5. **Contradictions:** when writing `contradicts:`, set the **refuted** Concept to `status: Contested`.
6. **After write:** run consolidate (`docs/14` §3): Health QQLs in `health/*.md` via `run_qql`, plus `links kind=dead` / `orphans` / `suggest`. Fix broken links from `write_note` audit immediately.
7. **Register** new pages in `index.md` with one line each.

## MCP tools you should use

`read_note` → `write_note` (watch `broken_links` / `orphan_hint`) → `search_notes` / `run_qql` / `links` as needed → `vault_info` if unsure of layout.

## Done when

- [ ] Source is `Digested` with `derived_into`
- [ ] At least one Active Summary linked via `source`
- [ ] Mentions / wikilinks produce reverse links (do not hand-fill `mentioned_in`)
- [ ] Four slots considered (empty slot OK if N/A; say so in the reply)
- [ ] One consolidate pass completed; open gaps recorded if any
