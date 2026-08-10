# Agent guidance — Open LLM Wiki vault

This directory is a **local-first LLM wiki** (OWF-1 soft types). Files are the source of truth.

## Tools

Prefer the **open-llm-wiki** MCP server: `vault_info`, `list_notes`, `search_notes`, `read_note`, `write_note`, `run_qql`, `links`, `lint_vault`.

## Ingest / 提炼

When the user asks to **ingest, distill, 提炼, or 消化** a note into the wiki:

1. Open and follow the skill: **`.agents/skills/wiki-ingest/SKILL.md`**  
   (Claude Code may also use **`.claude/skills/wiki-ingest/SKILL.md`** — same content.)
2. Pass the vault-relative path of the raw note.
3. Do not invent procedure from memory; the skill is the checklist.

Legacy long prompt (fallback only): `prompts/ingest-distill.md`.

## Rules of thumb

- Prefer updating existing pages over near-duplicates.
- `write_note` audits broken links — fix what it reports.
- `lint_vault` findings are **candidates**, not auto-fixes (except skill-defined Contested bookkeeping when you write `contradicts`).
