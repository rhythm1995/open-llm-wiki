<div align="center">

<img src="./ui/public/olw-mark.png" alt="Open LLM Wiki" width="72" />

# Open LLM Wiki

A local-first, file-as-truth knowledge-base desktop app — your Markdown files are the only source of truth.

[![CI](https://img.shields.io/github/actions/workflow/status/rhythm1995/open-llm-wiki/ci.yml?style=flat-square)](https://github.com/rhythm1995/open-llm-wiki/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)

<!-- README-I18N:START -->

**English** | [简体中文](./README.zh.md)

<!-- README-I18N:END -->

[Features](#features) · [Getting started](#getting-started) · [User guide](./docs/user/README.md) · [Architecture](#architecture)

</div>

![Editor: note list, WYSIWYG body, and backlinks](docs/user/images/editor-en.png)

Dual-mode editor, relationship graph, vault-health board, canvas and sheets, plus git and a built-in MCP server. Everything runs on your machine. No account, no cloud sync.

> [!NOTE]
> A vault is just a folder of Markdown files on disk. Leave whenever you want — take the files with you.

## Features

- **Dual-mode editing** — CodeMirror source + BlockNote WYSIWYG, with a lossless round-trip. `[[wikilink]]` complete, follow, and backlinks.
- **Graph** — wikilinks and frontmatter relations as an interactive network; force / type layers / timeline.
- **Vault health** — scores and a next action on entry; 11 locked queries grouped as structure / evidence / trust. Nobody has to learn a query language.
- **In-app agent** — sidebar ACP session: recipe picker, three-tier permissions, `@`-note context, git snapshots for agent writes.
- **External agents** — built-in MCP (8 tools) so Cursor / Claude Code and friends can read and write the current vault. One-click memory onboarding.
- **Commands and search** — `⌘K` commands, `⌘P` quick-open, `⌘⇧F` full-text search.
- **Media** — paste / drag images into `attachments/`; orphan cleanup.
- **Git** — desktop-only status / commit / pull / push / restore via system `git` when the vault is a repo.
- **Local-first** — preferences stay on the machine. UI: 简体中文 / English.

## Interface

| Graph | Vault health |
| --- | --- |
| ![Graph view: note nodes and directed edges](docs/user/images/graph-en.png) | ![Health overview scores and next action](docs/user/images/health-en.png) |

![Command palette ⌘K](docs/user/images/palette-en.png)

The full walkthrough is in the [user guide](./docs/user/README.md). The same files render on the [marketing site](./site/README.md) under `/docs`.

## Getting started

### Build from source (works today)

```bash
git clone https://github.com/rhythm1995/open-llm-wiki.git
cd open-llm-wiki
pnpm install --dir ui
pnpm build:app          # → target/release/bundle/macos/Open LLM Wiki.app
open target/release/bundle/macos/Open LLM Wiki.app
```

Browser preview (in-memory mock, no Rust compile):

```bash
pnpm --dir ui dev       # → http://localhost:5173
```

Full desktop app (real Rust core). Launch from the **repo root**:

```bash
ui/node_modules/.bin/tauri dev
```

> [!IMPORTANT]
> The Tauri config lives in `app/src-tauri/`. Do not use `pnpm --dir ui exec tauri` — `--dir` changes CWD and discovery fails.

### Prebuilt app (once published)

Grab `Open LLM Wiki.app` from [Releases](https://github.com/rhythm1995/open-llm-wiki/releases) and move it to `/Applications`. Builds are **unsigned**. If Gatekeeper blocks the first launch:

```bash
xattr -cr "/Applications/Open LLM Wiki.app"
```

Or: *System Settings → Privacy & Security → Open Anyway*. Requires macOS 10.15+. Bundle ID is `dev.openllmwiki.desktop` — replace the old copy; do not keep two apps side by side.

After launch: open a Markdown folder as your vault, or create the sample wiki. Click the toolbar logo for the in-app overview.

## User guide

| You want to… | Open |
| --- | --- |
| Do this for the first time | [Tutorial](./docs/user/tutorial.md) |
| Finish a specific job | [How-to](./docs/user/how-to.md) |
| Look up shortcuts / views / file types | [Reference](./docs/user/reference.md) |
| Understand file-as-truth and types | [Concepts](./docs/user/concepts.md) |

Design and implementation notes live in [docs/](./docs/README.md) (for contributors and agents).

## Architecture

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6 + BlockNote)
        │  IPC (@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 shell: file IO + commands, no business logic)
        ▼
core (Rust: parsing / graph / search — pure logic, IO-free)
```

- `core/` — pure functions, no IO.
- `app/src-tauri/` — wires files, git, and core.
- `mcp/` — built-in MCP server.
- `ui/` — three-pane UI. Browser dev uses `src/lib/mock.ts`.

Stack: [Tauri 2](https://tauri.app/) · [React 19](https://react.dev/) · [CodeMirror 6](https://codemirror.net/) · [BlockNote](https://blocknotejs.org/) · [force-graph](https://github.com/vasturiano/force-graph) · [Excalidraw](https://excalidraw.com/) · [ironcalc](https://www.ironcalc.com/)

## Requirements

- macOS 10.15+ (prebuilt); Windows / Linux buildable from source.
- Node.js + pnpm (frontend / dev).
- Rust toolchain (`core` and the Tauri shell).

> [!WARNING]
> Builds are unsigned and there is no auto-update. The browser mock does not evaluate Health QQL details (graph scores still work). Do not write the query language by hand — ad-hoc questions go to **Ask Agent**.

Repo: [rhythm1995/open-llm-wiki](https://github.com/rhythm1995/open-llm-wiki) · Feedback: [Issues](https://github.com/rhythm1995/open-llm-wiki/issues)
