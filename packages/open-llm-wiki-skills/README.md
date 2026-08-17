# open-llm-wiki-skills

Install **agent skills** (and optional **hooks templates**) for [Open LLM Wiki](https://github.com/rhythm1995/open-llm-wiki) vaults.

No npm registry account required if you install **from GitHub**.

## Install from GitHub (recommended without npm publish)

```bash
# current directory = vault root
npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills install .

# explicit vault + overwrite + hooks templates
npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills install ~/Open\ LLM\ Wiki-Memory --force --hooks
```

Equivalent git URL form:

```bash
npx --yes --package=git+https://github.com/rhythm1995/open-llm-wiki.git#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills install .
```

Pin a branch/tag/commit before `#path:` if needed, e.g.  
`github:rhythm1995/open-llm-wiki#release/v0.1.0:path:packages/open-llm-wiki-skills`  
(npm path syntax: `repo#ref:path:subdir` — if your npm version differs, use the `git+https://...` form.)

## Install from npm (after publish)

```bash
npx open-llm-wiki-skills install .
```

## What gets written

| Path | Purpose |
|------|---------|
| `.agents/skills/wiki-ingest/SKILL.md` | Generic skill root |
| `.claude/skills/wiki-ingest/SKILL.md` | Claude Code discovery |
| `AGENTS.md` | Pointer (only if missing, or append with `--force`) |
| `.agents/hooks/olw-post-write.mjs` | Optional write-hook script (default install) |
| `.claude/hooks.olw.snippet.json` | Claude settings **snippet** (merge manually) |
| `.cursor/hooks.olw.example.json` | Cursor hooks **example** (merge manually) |

Hooks files are **templates**. They do **not** replace live `settings.json` unless you merge them.  
In-app Agent (ACP) uses **Settings → Agent memory → turn-end check** instead of these files.

## After install

```text
Run skill wiki-ingest on path/to/note.md using open-llm-wiki MCP tools.
```

Wire MCP: desktop **Settings → Agent memory**, or `open-llm-wiki-mcp setup --vault <path>`.

## List package contents

```bash
npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills list
```

## License

Apache-2.0
