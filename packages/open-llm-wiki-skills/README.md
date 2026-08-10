# open-llm-wiki-skills

Agent **skills** for [Open LLM Wiki](https://github.com/open-llm-wiki/open-llm-wiki) vaults.

Installs procedure files (not the MCP binary) into a vault so coding agents can run **ingest / 提炼** without pasting long prompts.

## Install into a vault

```bash
# current directory = vault root
npx open-llm-wiki-skills install .

# or explicit path
npx open-llm-wiki-skills install ~/Open\ LLM\ Wiki-Memory

# overwrite existing skill files
npx open-llm-wiki-skills install . --force
```

Writes:

| Path | Purpose |
|------|---------|
| `.agents/skills/wiki-ingest/SKILL.md` | Generic agent skill root |
| `.claude/skills/wiki-ingest/SKILL.md` | Claude Code discovery path |
| `AGENTS.md` | Only if missing (pointer to skill + MCP) |

## List packaged skills

```bash
npx open-llm-wiki-skills list
```

## Trigger (after install + MCP)

Tell your agent:

```text
Run skill wiki-ingest on path/to/note.md using open-llm-wiki MCP tools.
```

Wire MCP with the desktop app (**Settings → Agent memory**) or:

```bash
open-llm-wiki-mcp setup --vault /path/to/vault
```

## License

Apache-2.0
