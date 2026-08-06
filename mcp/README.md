# openobs-mcp

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent read, write, and reason over an OpenObsidian vault — including its **note graph** (wikilinks + frontmatter relations).

- Transport: stdin/stdout JSON-RPC 2.0 (Content-Length framing **and** NDJSON both accepted).
- Stateless per call: each tool invocation rebuilds the in-memory index from disk, so it always reflects the current vault.
- Graph-aware (Phase 6B): `links` query, read-time briefing, write-time broken-link audit.

## Build

```bash
cargo build -p openobs-mcp        # release: cargo build -p openobs-mcp --release
```

The binary is `openobs-mcp`. It resolves the vault root from (in order): the first CLI arg, the `OPENOBS_VAULT` env var, or the current directory.

## Tools

| Tool | Args | Returns |
| --- | --- | --- |
| `list_notes` | — | Relative `.md` paths under the vault. |
| `read_note` | `path` | `{ path, body, graph }` — `graph` summarizes `backlinks`, `forward`, `dead` links and in/out degree. |
| `write_note` | `path`, `content` | `{ path, broken_links[], orphan_hint }` — audited against the rebuilt graph right after writing. |
| `links` | `kind`, `path?`, `mode?`, `limit?` | One key per requested `kind` (see below). |
| `search_notes` | `query` | Full-text AND hits over titles/bodies, scored. |
| `run_qql` | `qql` | OpenObsidian Query Language result (list / count / table / groups). |
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

## Client configuration

### Claude Code (`~/.config/claude-code/config.json` or project `.mcp.json`)

```jsonc
{
  "mcpServers": {
    "openobsidian": {
      "command": "/absolute/path/to/openobs-mcp",
      "args": ["/absolute/path/to/your/vault"]
    }
  }
}
```

### Cursor / generic MCP (`command` + `env`)

```jsonc
{
  "mcpServers": {
    "openobsidian": {
      "command": "/absolute/path/to/openobs-mcp",
      "env": { "OPENOBS_VAULT": "/absolute/path/to/your/vault" }
    }
  }
}
```

> Use an absolute path to the binary. If you pass the vault as an arg **and** set `OPENOBS_VAULT`, the arg wins.

## Notes

- Hidden paths (any segment starting with `.`, e.g. `.git`, `.openobsidian`, `.trash`) are excluded from `list_notes` and the index — the same rule the desktop app uses.
- `write_note` creates parent directories as needed; relative paths only (`..` is rejected).
- Output framing is sent with **both** a `Content-Length` header and a trailing newline, so strict-header clients and line-based clients both work.
