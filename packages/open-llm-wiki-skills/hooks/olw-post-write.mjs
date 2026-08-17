#!/usr/bin/env node
/**
 * Optional PostToolUse / after-write hook for Claude Code / Cursor.
 * Runs in the vault (or project) directory — does not call LLM.
 * Prints a short reminder to consolidate / lint after vault edits.
 *
 * Wire via settings snippet (see hooks/claude-settings.snippet.json
 * and hooks/cursor-hooks.example.json installed next to this file).
 */
const cwd = process.cwd();
const hint = `[open-llm-wiki] write finished under ${cwd}
  • If you distilled a Source: ensure status Digested + Summary source: link
  • If facts changed: overwrite hot.md as a whole page (~500 words, not a log)
  • Consolidate: MCP lint_vault / health QQLs; skill wiki-ingest §Done when
  • Install/update skills: npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills open-llm-wiki-skills install .
`;
// Hooks should be quiet on success paths; use stderr so it shows in agent logs.
console.error(hint.trim());
process.exit(0);
