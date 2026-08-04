# OpenObsidian

A local-first, file-as-truth, MIT-licensed knowledge-base desktop app — your plain Markdown files are the only source of truth. A dual-mode editor, a Cytoscape graph, an Excalidraw canvas, and a Sheet view, plus git and a built-in MCP server, all on your own machine. No account, no cloud sync.

<!-- README-I18N:START -->

[简体中文](./README.md) | **English**

<!-- README-I18N:END -->

## Features

- **Dual-mode editor:** CodeMirror 6 source mode + BlockNote WYSIWYG, with a verified Markdown↔block roundtrip (real-engine gate + diagnostic suite) so switching loses nothing.
- **Graph view:** Cytoscape renders your wikilinks and frontmatter relations; switch force-directed / type-layer / timeline layouts; filter by type and tag.
- **Canvas:** infinite Excalidraw whiteboard (MIT); `.canvas` files are truth, saved alongside your notes.
- **Sheet:** embedded tables (v2); CSV-like editing inside a note.
- **Command palette:** ⌘K commands, ⌘P quick-open, ⌘⇧F full-text search across the vault (notes, canvas, sheet).
- **Media:** paste / drag / insert images into `attachments/`; first-class MediaIndex + orphan-attachment cleanup.
- **Editing UX:** find & replace, outline (headings), source｜reading split preview, broken-link hints for the current note, task-list buttons.
- **Git:** status / log / commit / pull / push / restore + auto-commit, via your system `git`; only inside the Tauri desktop app when the vault is a git repo.
- **AI context export:** one-click copy of the current note plus the body of its linked neighbors as LLM-friendly Markdown.
- **Local-first:** everything runs locally; preferences live in local config and are never uploaded.
- **AI-ready (MCP):** a built-in MCP server exposes 6 tools (`list_notes` / `read_note` / `write_note` / `search_notes` / `run_qql` / `vault_info`) so agents like Claude Desktop can read and write your vault.
- **i18n:** 简体中文 / English UI.

## Getting Started

### Option A — Build from source (works today)

```bash
git clone https://github.com/rhythm1995/OpenObsidian.git
cd OpenObsidian
pnpm install --dir ui
pnpm build:app          # = bash scripts/build-app.sh → target/release/bundle/macos/OpenObsidian.app
open target/release/bundle/macos/OpenObsidian.app
```

Browser dev preview (live reload, in-memory mock backend, no Rust compile needed):

```bash
pnpm --dir ui dev       # → http://localhost:5173
```

Run the full desktop app from source (real Rust core):

```bash
ui/node_modules/.bin/tauri dev
```

> The Tauri config lives in `app/src-tauri/`, so launch the Tauri CLI from the **repo root** (it discovers `app/src-tauri` recursively). Don't use `pnpm --dir ui exec tauri` — `--dir` moves CWD into `ui/` and discovery fails.

### Option B — Download a prebuilt app (once published)

Grab `OpenObsidian.app` from [Releases](https://github.com/rhythm1995/OpenObsidian/releases):

- **macOS:** move it to `/Applications`; choose *Replace* if one exists. Builds are **unsigned**, so the first launch is blocked by Gatekeeper — *System Settings → Privacy & Security → Open Anyway*, or:
  ```bash
  xattr -cr /Applications/OpenObsidian.app
  ```
  Requires macOS 10.15+. The bundle ID is fixed at `dev.openobsidian.desktop` — **replace the old version**, don't keep multiple "OpenObsidian" side by side. Local preferences (localStorage / config) **survive replacing the .app**.

## Configuration

Settings are in-app (⌘K → Settings): theme (dark/light), language (zh/en), default edit mode (source/wysiwyg), attachment layout, graph forces, log profile. All persisted locally.

## Architecture

```
ui (React 19 + Vite + Tailwind 4 + CodeMirror 6 + BlockNote)
        │ IPC (@tauri-apps/api invoke)
        ▼
app/src-tauri (Tauri 2 shell: file IO + commands, no business logic)
        │
        ▼
core (Rust: parsing / graph / search — pure logic, IO-free, TDD)
```

- `core/` — pure functions, no IO, guarded by unit tests + proptests.
- `app/src-tauri/` — Tauri commands wiring file IO, git, and `core`.
- `mcp/` — the built-in MCP server (6 tools) for AI agents.
- `ui/` — three-pane layout (file tree / editor / inspector); switchable graph / git views; ⌘K palette. Browser dev uses `src/lib/mock.ts` (in-memory backend) — preview without compiling Rust.

## Requirements

- macOS 10.15+ (prebuilt); Windows / Linux buildable from source.
- Node.js + pnpm (frontend / dev).
- Rust toolchain (`core` and the Tauri shell).

## Tech Stack

- [Tauri 2](https://tauri.app/) — desktop shell (Rust).
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) + [Tailwind CSS 4](https://tailwindcss.com/) — UI.
- [CodeMirror 6](https://codemirror.net/) — source editor.
- [BlockNote](https://blocknotejs.org/) — WYSIWYG editor.
- [Cytoscape](https://js.cytoscape.org/) — graph.
- [Excalidraw](https://excalidraw.com/) — canvas.
- [ironcalc](https://www.ironcalc.com/) — Sheet.

## Contributing

This is a clean-room rewrite. **Red line: the project takes [Tolaria](https://github.com/refactoringhq/tolaria) (AGPL-3.0) as a design and implementation reference only — no source is copied, verbatim or near-verbatim.** We borrow architecture, data flow, algorithmic ideas, and feature concepts (mostly uncopyrightable ideas/methods); all source, component implementations, and visual expression are our own. Obsidian is used only as a public feature comparison, and its source is likewise not copied. See [docs/](./docs/) (start with [docs/README.md](./docs/README.md)).

- Done features: [docs/FEATURE-INDEX.md](./docs/FEATURE-INDEX.md)
- Roadmap / backlog: [docs/backlog.md](./docs/backlog.md)
- New deps must be logged in [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md); no PR may introduce verbatim Tolaria source fragments — diffs are checked at review.

## Known Limitations

- **Unsigned builds** — no code-signing/notarization yet; macOS first launch needs the Gatekeeper workaround above.
- **Graph polish deferred** — the graph is functional but not commercial-grade (layout persistence, force panel, shortest-path highlighting postponed; see [CHANGELOG](./CHANGELOG.md)).
- **QQL is programmatic only** — the user-facing QQL UI was removed; the query engine remains in the Rust core, reachable via the MCP `run_qql` tool, with no GUI query surface.
- **No auto-update.**

## License

[MIT](./LICENSE). See [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES.md) for dependencies. Canvas uses [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT); BlockNote is MPL-2.0.
