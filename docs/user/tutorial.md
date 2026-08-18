# Tutorial: fifteen minutes in a vault

<!-- README-I18N:START -->

**English** | [简体中文](./tutorial.zh.md)

<!-- README-I18N:END -->

This is a lesson, not a menu dump. When you finish you should have: opened a vault, read a note, followed a link, seen those notes on the graph, and read Health. The folder you walked is already a compiled wiki — and it is already memory, even before you attach an agent.

You need: a Mac (or the browser preview already running) and about fifteen minutes. Do not change settings or wire an agent yet — those belong in the [how-to](./how-to.md).

## 1. Open the app

**Desktop:** launch Open LLM Wiki. An unsigned build from source may be blocked once. Use *System Settings → Privacy & Security → Open Anyway*, or:

```bash
xattr -cr "/Applications/Open LLM Wiki.app"
```

**Browser preview (for development):**

```bash
pnpm --dir ui dev
```

Open <http://localhost:5173>. The preview loads a demo vault automatically — skip to step 3.

## 2. Open a vault

The welcome screen’s primary button is **Open a Markdown folder**. Pick any directory of `.md` files.

You can also **Create a sample wiki**. The app seeds wiki-starter (type contracts, `index.md`, `hot.md`, health query templates).

> [!TIP]
> A vault is not an account and not a cloud drive. It is that folder. Copy the folder when you change machines.

## 3. Open a note

Left: navigation (all notes / types / tags). Center: the list. Mid-right: the body. Far right: properties and backlinks.

1. Click a note in the list. The default editor is WYSIWYG.
2. Look at **Backlinks** on the right: who points here.
3. Blue `[[links]]` in the body are clickable.

![A Concept note open, with backlinks on the right](./images/editor-en.png)

Open a note tagged as a Concept. You should see a type chip, a status (for example Active or Contested), and at least one backlink.

## 4. Follow a link

1. Click a wikilink in the body.
2. A tab opens for the target. Use Back in the top-left of the nav column to return.
3. If the link points at a note that does not exist yet, the inspector shows a yellow **unresolved link** hint. That is expected — create the note later.

That loop — **read → follow → read** — is the basic motion of this app.

## 5. Look at the graph

Click the **Graph** icon in the toolbar (the network-shaped icon).

![Graph: nodes are notes, edges are wikilinks](./images/graph-en.png)

- Each circle is a note.
- Lines are `[[wikilinks]]` or frontmatter relations.
- Click a node: the card at the bottom shows type and degree.
- **Follow current** keeps the camera near the note you are reading.

If you just jumped from a note, you should see it and its neighbors. That web is the insight lattice — not a folder tree.

## 6. Look at vault health

Click the heartbeat icon to open **Health**.

![Health: six scores and a next action](./images/health-en.png)

Read the six tiles (source digestion, concept coverage, contested, orphans, single-source, unreviewed) and the next-action line. Do not learn how the eleven queries on the left are written.

The browser preview says it will not run QQL; scores still come from the graph. On desktop the eleven queries run in the background and badges appear.

## You are done with the lesson

You can open a vault, read, follow links, read the graph, and read health. You did not attach an agent — you do not need to, to have a wiki. The same folder is what Cursor, Claude Code, or the in-app sidebar will later use as memory.

Next, pick by need:

- Write notes, insert images, distill a source, attach this vault as AI memory → [How-to](./how-to.md)
- Look up shortcuts, types, MCP tools → [Reference](./reference.md)
- Why compile, why Health, why files are memory → [Concepts](./concepts.md)

Stuck? Click the toolbar logo for the in-app overview.

![In-app overview](./images/help-en.png)
