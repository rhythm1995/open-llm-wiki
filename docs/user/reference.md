# Reference

<!-- README-I18N:START -->

**English** | [简体中文](./reference.zh.md)

<!-- README-I18N:END -->

Facts only. For recipes see the [how-to](./how-to.md).

## Help menu

| Item | Opens |
| --- | --- |
| User Guide | <https://rhythm1995.github.io/open-llm-wiki/docs/start> |
| Report Issue… | GitHub Issues for this repo |

The in-app overview (logo next to `⌘K`) is a short card, not this handbook.

## Keyboard shortcuts

macOS. On Windows / Linux use `Ctrl` in place of `⌘`.

| Shortcut | Action |
| --- | --- |
| `⌘K` | Command palette |
| `⌘P` | Quick-open by title |
| `⌘⇧F` | Full-text search in the vault |
| `⌘O` | Open vault |
| `⌘N` | New note |
| `⌘S` | Save now (autosave already runs) |
| `⌘W` | Close current tab |
| `⌘F` | Find / replace in the current note |
| `⌘,` | Settings |
| `⌘A` | Select all |

In-app overview: click the logo next to `⌘K`.

## Main views

Four icons on the left of the toolbar:

| View | What it is |
| --- | --- |
| Editor | Default. List + body + inspector |
| Graph | Note relationship network |
| Health | Scores, next action, 11 locked queries |
| Git | Only when the vault is a git repo: status / log / commit / pull / push |

There is no query view. There is no QueryPanel.

## Three columns

| Column | Contents |
| --- | --- |
| Left | Inbox / all notes / archive / types / tags / folders |
| Center | Note list; then editor, graph, health, or git |
| Right | Inspector (backlinks, properties, outline, media) or Agent |

Four toggles on the right of the toolbar show or hide: nav, list, inspector, agent.

## File types

| Extension | Role |
| --- | --- |
| `.md` | A note. YAML frontmatter + Markdown body |
| `.canvas` | Excalidraw whiteboard. Not in the graph, not in the search index |
| Sheet files | Embedded spreadsheet (multiple sheets / freeze / formulas). Not full Excel interop |

Hidden directories (any path segment starting with `.`, such as `.git` or `.open-llm-wiki`) are not indexed.

## Soft types in frontmatter

`type:` is an optional string. It is **never validated and never blocks a save**. Missing means `Note`. wiki-starter conventions:

| `type` | UI label | Role |
| --- | --- | --- |
| `Source` | Source | Immutable original |
| `Summary` | Summary | Readable digest derived from a Source |
| `Entity` | Entity | Person / org / system |
| `Concept` | Concept | A claim that can be contested |
| `Query` | Query note | Health templates and the like; not a DSL for humans |
| `Note` | Note | Everything else |

Common `status:` values:

| Used on | Values |
| --- | --- |
| Source | `Unprocessed` / `Digested` |
| Summary | `Active` / `Superseded` |
| Concept | `Active` / `Contested` |

Other common keys: `tags`, `definition`, `related_to`, `contradicts`, `source`, `mentions`, `provenance` (`human` / `agent` / `ingested`), `reviewed`, `evidence_tier`, `last_verified`. All of them are optional.

## The 11 health checks

Built-in catalog, aligned with starter `health/*.md` by basename. Read the titles. Do not write QQL.

| Group | Metrics |
| --- | --- |
| Structure | Contested concepts, orphans, duplicate titles |
| Evidence | Concept hunger, single-source concepts, evidence mix, stale sources |
| Trust | Unreviewed agent pages, stale agent reviews, unreviewed pages, knowledge mix |

The six overview tiles are computed live from the graph (same inbound degree as backlinks). They are not a twelfth query. The three trust tiles depend on `reviewed` / `provenance`; empty fields make them look red. The group caption explains that.

## Agent memory

| Path | What it is |
| --- | --- |
| Settings → Agent memory | One-click MCP for Cursor / Claude Code / others; installs `wiki-ingest` |
| Agent pane (toolbar robot) | In-app ACP session |
| `hot.md` | ~500-word cache at the vault root, rewritten as a whole page, not a log |
| `index.md` | Catalog the agent should read after `hot.md` |

The in-app agent injects `hot.md` on the first turn and again every few turns. After a turn that wrote the vault, you are asked to update it. Chat transcripts never enter the vault.

## MCP tools

Built-in server `open-llm-wiki-mcp`, eight tools:

| Tool | Role |
| --- | --- |
| `list_notes` | Relative paths |
| `read_note` | Body plus a graph briefing (backlinks / forward / dead / degree) |
| `write_note` | Write and return broken-link / orphan hints |
| `links` | Backlinks / forward / dead / orphans / hubs / suggest |
| `search_notes` | Full-text AND |
| `run_qql` | Evaluate a query (for agents, not a GUI) |
| `vault_info` | Root path and note count |
| `lint_vault` | Structural lint candidates; does not change files |

`lint_vault` only yields candidates: a `contradicts` edge with no Contested endpoint, a Contested concept with no `contradicts`, a Summary on a superseded Source, a live page still pointing at a superseded page, and normalized title collisions.

## Settings (what you can change)

`⌘,`: theme, language, default edit mode, attachment layout, log profile. All local.

## Feedback

Issues: <https://github.com/rhythm1995/open-llm-wiki/issues>
