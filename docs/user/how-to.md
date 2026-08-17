# How-to guides

<!-- README-I18N:START -->

**English** | [简体中文](./how-to.zh.md)

<!-- README-I18N:END -->

Each section solves one job. If you already have a vault open, start here. First time? Use the [tutorial](./tutorial.md).

## Open or switch a vault

1. Press `⌘O`, or the folder-plus control in the list header, or `⌘K` → **Open Vault**.
2. Choose a Markdown folder on disk.
3. Recently opened vaults appear on the welcome screen — click one.

On desktop you can drop a folder onto the welcome screen. The browser preview uses an in-memory demo vault and cannot open a folder from disk.

## Create a note

1. Press `⌘N`, or the `+` in the list header.
2. An inline title field appears. Rename it and press Enter.
3. Write in the body. Default mode is WYSIWYG; the `</>` control switches to source.

The app autosaves. The status bar shows the current path.

## Link two notes with a wikilink

In source or WYSIWYG type:

```md
See [[Title of the other note]]
```

`[[` opens title completion. Click a link to follow it. **Backlinks** on the right lists who points here.

Relations also belong in frontmatter:

```yaml
related_to: "[[Index]]"
contradicts: "[[Zettelkasten]]"
```

Both show up on the graph. Broken targets get a yellow inspector banner.

## Switch editor mode, find, split preview

| You want | Do this |
| --- | --- |
| Source | Click `</>`, or `⌘K` → switch to source |
| WYSIWYG | Click again, or `⌘K` → switch to WYSIWYG |
| Find in this note | `⌘F` |
| Search the vault | `⌘⇧F` |
| Quick-open by title | `⌘P` |
| Source beside reading | `⌘K` → turn on split reading preview |

`⌘F` never changes your default edit mode.

## Insert an image

Paste, drag, or use the image button on the format bar. Files land under `attachments/` in the vault (default: a folder per note). The body stores a relative path, not a data URL.

To remove unreferenced files: `⌘K` and search for “orphan” or “clean”.

## Use the command palette

`⌘K` opens the command list. Type to filter. Frequent items: Open Vault, Settings, Connect external agent memory, Query vault, Report an issue.

![Command palette](./images/palette-en.png)

`⌘P` only quick-opens files. `⌘⇧F` only searches bodies. Do not mix them up with `⌘K`.

## Read the graph and jump to a note

1. Click **Graph** in the toolbar.
2. Drag to pan, scroll to zoom, click a node for the bottom card.
3. **Filter** narrows by type / tag. **More** holds layouts (force / type layers / timeline).
4. Click the card or node to open that note.

Canvas files (`.canvas`) are a separate whiteboard. They are not on the graph and have no New button. Existing `.canvas` files still open for editing.

## Read vault health and pick the next action

1. Click the heartbeat icon.
2. Read the six tiles and the next-action line first.
3. The eleven items on the left are grouped as structure / evidence / trust. Open one for detail (desktop).
4. Type a natural-language question at the top right and click **Ask Agent**. Do not write a query by hand.

![Health overview](./images/health-en.png)

> [!NOTE]
> The browser preview does not run those eleven QQL templates. It still shows live graph scores. On desktop the view sweeps the queries in the background and fills badges.

Hunger targets: an `Active` concept wants at least two inbound links; `Contested` wants at least three. Short rows are highlighted.

## Distill a source into the wiki

Use this when you have a `type: Source` (or untyped material) and you want an agent to produce Summary / Entity / Concept pages from it.

1. Open that note.
2. Settings → Agent memory → one-click connect (installs MCP and the `wiki-ingest` skill). Desktop only.
3. `⌘K` → **Distill into Wiki**, or the distill control on the note.
4. Pick an installed agent and send.

The agent should follow wiki-ingest: write a new Summary, mark the Source `Digested`, create Entity / Concept pages, and add a line to `index.md`. It must not rewrite the Source body (treat the Source as immutable).

## Use the in-app agent

1. Toggle the Agent pane (robot control, top right).
2. Pick a recipe installed on this machine (opencode, claude-code, …).
3. `@`-mention the current note or others.
4. Send. Tool calls fold into cards. Permissions are three-tier: ask every time / relaxed / high-risk still gated.

The browser mock cannot see local agents and will tell you to install one. After a turn that wrote the vault, if `hot.md` exists, the app asks you to rewrite that session cache as a whole page (it does not write it for you).

**Query vault** seeds a short natural-language instruction so the agent can answer health or ad-hoc questions. It does not open a query editor.

## Connect an external agent to this vault

Desktop: Settings → Agent memory → one-click connect. The app detects Cursor / Claude Code / etc., writes user-level MCP config, and can seed the vault from wiki-starter.

CLI equivalent:

```bash
# in the vault root
npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills \
  open-llm-wiki-skills install . --hooks
```

Cheap read order for agents: `hot.md` → `index.md` → then `read_note` / `links` as needed. Do not start with a full-vault search.

## Change language, theme, default edit mode

`⌘,` opens Settings. Dark / light theme, 简体中文 / English UI, default source / wysiwyg, and attachment layout live there. Everything stays on this machine.

The `EN` / `中` control in the status bar switches the UI language immediately.

## Report a problem

`⌘K` → **Report an issue**, or the card in the help guide, or Settings → Diagnostics. That opens [GitHub Issues](https://github.com/rhythm1995/open-llm-wiki/issues). On desktop, export diagnostic logs from Settings first.
