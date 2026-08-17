# open-llm-wiki-mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent read, write, and reason over an Open LLM Wiki vault — including its **note graph** (wikilinks + frontmatter relations).

- Transport: stdin/stdout JSON-RPC 2.0 (Content-Length framing **and** NDJSON both accepted).
- Stateless per call: each tool invocation rebuilds the in-memory index from disk, so it always reflects the current vault.
- Graph-aware (Phase 6B): `links` query, read-time briefing, write-time broken-link audit.

## Build

```bash
cargo build -p open-llm-wiki-mcp        # release: cargo build -p open-llm-wiki-mcp --release
```

The binary is `open-llm-wiki-mcp`. It resolves the vault root from (in order): the first CLI arg, the `OPEN_LLM_WIKI_VAULT` env var, or the current directory.

## Agent onboarding

`open-llm-wiki-mcp` can wire itself into your locally installed agents:

```bash
open-llm-wiki-mcp setup [--vault P] [--agent ID]... [--yes] [--dry-run] [--remove]
open-llm-wiki-mcp doctor [--vault P]
open-llm-wiki-mcp init <dir> [--force]
open-llm-wiki-mcp help
```

- `setup` detects which agents are installed (PATH binary ∨ config file ∨ macOS app bundle) and registers an `open-llm-wiki` entry (`command` = this binary, `args` = vault path) in each agent's **user-level** MCP config. If the vault does not exist yet it is seeded from the bundled wiki-starter template (includes `hot.md` session cache) after confirmation.
  - `--vault P` — vault to expose (default: `$OPEN_LLM_WIKI_VAULT`, else `~/Open LLM Wiki-Memory`)
  - `--agent ID` — only act on these agents (repeatable); default: every detected one
  - `--yes` — never prompt (required when stdin is not a terminal, e.g. in CI)
  - `--dry-run` — print the plan without writing anything
  - `--remove` — unregister instead of register
- `doctor` diagnoses wiring health (binary / vault / notes / `format: owf/1` / scaffold / per-agent entry) and exits 1 on failure — script-friendly.
- `init <dir> [--force]` seeds the wiki-starter template (`--force` merges into a non-empty dir; existing files are never overwritten). Includes **wiki-ingest** skill under `.agents/skills/` and `.claude/skills/`.

### Vault skills + hooks templates (ingest / 提炼)

Procedure lives in a vault skill (not a long chat prompt). **No npm login required** — install from GitHub:

```bash
# in vault root (or pass absolute path)
npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills install . --hooks
```

Also writes optional hook templates under `.agents/hooks/` + Claude/Cursor example JSON (merge manually).  
In-app Agent uses **Settings → Agent memory** / panel **轮次结束检查** (ACP lint after each turn).

Short agent trigger: `Run skill wiki-ingest on <path> using open-llm-wiki MCP tools.`

After npm publish you can also: `npx open-llm-wiki-skills install .`

Agent ids: `claude-code`, `claude-desktop`, `cursor`, `codex`, `windsurf`, `zed`, `grok` (manual).

Safety (writing other apps' config files):

1. `.open-llm-wiki.bak` backup before every real write;
2. atomic write (same-directory temp file + rename);
3. files that cannot be parsed (e.g. JSONC with comments) are **never touched** — you get a manual snippet instead;
4. only user-level global configs are modified — never project-level (`.mcp.json`, `.claude/settings.json`);
5. `claude-code` prefers the official CLI (`claude mcp add-json -s user`) and falls back to direct file edits;
6. the guidance snippet printed at the end of `setup` is for you to paste into your agents' guidance files (CLAUDE.md / AGENTS.md) — it is never written anywhere automatically.

The desktop app exposes the same logic in **Settings → Agent Memory Onboarding** (no CLI needed).

Windows registry entries compile but are untested this round; the Linux Claude Desktop path is a community path, also untested.

## How agents should read a vault

Token-cheap order (same as starter `AGENTS.md`):

1. `read_note` `hot.md` if it exists (session cache, ≤500 words).
2. `read_note` `index.md`.
3. Then `run_qql` / `links` / `read_note` on a few hits — do not start with `search_notes` over the whole vault.

## Tools

| Tool | Args | Returns |
| --- | --- | --- |
| `list_notes` | — | Relative `.md` paths under the vault. |
| `read_note` | `path` | `{ path, body, graph }` — `graph` summarizes `backlinks`, `forward`, `dead` links and in/out degree. |
| `write_note` | `path`, `content` | `{ path, broken_links[], orphan_hint }` — audited against the rebuilt graph right after writing. |
| `links` | `kind`, `path?`, `mode?`, `limit?` | One key per requested `kind` (see below). |
| `search_notes` | `query` | Full-text AND hits over titles/bodies, scored. |
| `run_qql` | `qql` | Open LLM Wiki Query Language result (list / count / table / groups). |
| `vault_info` | — | `{ root, notes }`. |
| `lint_vault` | — | `{ summary, findings[], duplicate_names[] }` — L1 structural lint (see below). |

### `links` kinds

`kind` accepts a single string or an array. Results are returned as an object keyed by kind.

| Kind | Needs `path`? | Meaning |
| --- | --- | --- |
| `backlinks` | yes | Notes that link **to** this one (resolved sources). |
| `forward` | yes | Notes this one links **to** (resolved targets only). |
| `dead` | optional | Unresolved targets. Scoped to `path` if given, else whole-vault. |
| `orphans` | no | Notes with no resolved edges. `mode`: `incoming` \| `outgoing` \| `both` (default). |
| `hubs` | no | Top-`limit` (default 10) notes by degree. |
| `suggest` | yes | Notes whose **title** appears in this note's body but are not yet linked (minimal P6-6). |

Example — one call, multiple kinds:

```jsonc
{ "kind": ["orphans", "hubs", "dead"], "limit": 5 }
```

### `lint_vault` — L1 structural lint

Cross-note checks QQL cannot express (single-note predicates only). **Candidates only — the tool never mutates the vault**; acting on a finding is an explicit `write_note` decision by the agent/human (see `docs/14-llm-wiki-workflow.md` §3.2).

| Finding kind | Meaning |
| --- | --- |
| `contradiction_uncontested` | A `contradicts` edge exists but neither endpoint is `status: Contested`. |
| `contested_without_contradiction` | A Concept is `status: Contested` but has no inbound `contradicts` edge (state and graph disagree). |
| `summary_on_superseded` | A Summary's `source:` points at a Superseded page (retired Summary/Source pairs are exempt). |
| `ref_to_superseded` | An Active/Contested page still references a Superseded page (`contradicts` / `superseded_by` edges exempt). |
| `duplicate_names[]` | Normalized (lowercase + trim) title/alias collisions — link resolution silently prefers the first note. |

Each finding carries `kind`, `hint`, `subject { path, title }` and `other { path, title } | null`.

## Client configuration (manual fallback)

`setup` writes these for you; the snippets below are the fallback when a config file cannot be auto-edited (e.g. JSONC with comments). Use absolute paths; if you pass the vault as an arg **and** set `OPEN_LLM_WIKI_VAULT`, the arg wins.

### Claude Code — `~/.claude.json` (user scope)

Prefer the official CLI: `claude mcp add-json open-llm-wiki '{"command":"/abs/open-llm-wiki-mcp","args":["/abs/vault"]}' -s user`

```jsonc
{
  "mcpServers": {
    "open-llm-wiki": {
      "command": "/absolute/path/to/open-llm-wiki-mcp",
      "args": ["/absolute/path/to/your/vault"]
    }
  }
}
```

### Claude Desktop

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` · Windows: `%APPDATA%\Claude\claude_desktop_config.json` (JSON, same shape as Claude Code). Restart the app after wiring.

### Cursor — `~/.cursor/mcp.json` · Windsurf — `~/.codeium/windsurf/mcp_config.json`

```jsonc
{
  "mcpServers": {
    "open-llm-wiki": {
      "command": "/absolute/path/to/open-llm-wiki-mcp",
      "args": ["/absolute/path/to/your/vault"]
    }
  }
}
```

### Codex CLI — `~/.codex/config.toml`

```toml
[mcp_servers.open-llm-wiki]
command = "/absolute/path/to/open-llm-wiki-mcp"
args = ["/absolute/path/to/your/vault"]
```

### Zed — `~/.config/zed/settings.json`

```jsonc
{
  "context_servers": {
    "open-llm-wiki": {
      "command": "/absolute/path/to/open-llm-wiki-mcp",
      "args": ["/absolute/path/to/your/vault"],
      "settings": {}
    }
  }
}
```

### Grok CLI / others (manual)

No auto-wire surface is known; add the server in whatever MCP config mechanism the tool provides (the JSON shape above), or run `open-llm-wiki-mcp setup` and copy the printed snippet.

## Notes

- Hidden paths (any segment starting with `.`, e.g. `.git`, `.open-llm-wiki`, `.trash`) are excluded from `list_notes` and the index — the same rule the desktop app uses.
- `write_note` creates parent directories as needed; relative paths only (`..` is rejected).
- Output framing is sent with **both** a `Content-Length` header and a trailing newline, so strict-header clients and line-based clients both work.
