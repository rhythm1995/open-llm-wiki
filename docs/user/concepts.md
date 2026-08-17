# Concepts

<!-- README-I18N:START -->

**English** | [简体中文](./concepts.zh.md)

<!-- README-I18N:END -->

This page is the “why”. It does not tell you what to click. Steps live in the [tutorial](./tutorial.md) and the [how-to](./how-to.md).

## Files are the truth

The app does not own your data. Every note is an ordinary file on disk. Quit the app, open the folder in another editor, clone it with git — the files are still there, and so is the text.

The list, the graph, backlinks, and health scores are derivatives computed from those files. If a cache goes stale, a full vault scan rebuilds everything. There is no second, hidden database.

So:

- Renaming or moving a file in Finder is the same fact the next launch will see.
- Backup means copy the folder or `git commit`.
- Leaving means take the `.md` files.

## A vault is not an account

A vault is the folder you picked. No login, no cloud sync, no hosted “my library”. The desktop app remembers recent paths; that memory is a local preference only.

Two machines, one library: move the folder with git, a drive, or whatever sync you already use. The app does not sync.

## An insight lattice, not a folder tree

Folders are fine for attachments and drafts. They are a poor classification system. The moment the scheme changes, you have to move files.

This app keeps relationships in `[[wikilinks]]` and in frontmatter relation fields. The graph is a view of that web: nodes are notes, edges are links. The lightbulb mark is that metaphor — links form a structure you can light up.

You do not fill in backlinks by hand. Write `[[B]]` in A, and A appears on B’s inspector.

## Types are labels, not cages

`type: Concept` does not turn on a required form and does not refuse a save when a field is missing. Type only affects: nav grouping, icon color, which notes health treats as claims, and which contract an agent follows when it writes a new page.

You can omit `type:` entirely and the vault still works. Source / Summary / Entity / Concept in wiki-starter is a **suggested method**, so agents and the health board share a vocabulary.

`status:` is the same kind of convention. Whether a claim is `Active` or `Contested` is a fact on that note’s frontmatter, not a function of which folder it sits in.

## Sources stay put; summaries can be retired

Write raw material as `type: Source`. Write your understanding as a separate `type: Summary`. When the source changes, do not edit the old summary — mark it `Superseded` and write a new one. Leave version history to git.

That is what **Distill into Wiki** is for: ingest a Source, emit derived pages, do not scribble on the original.

## Why health is not a query editor

The query engine in Rust is capable. Teaching people a DSL with field names and render verbs stacks four layers of cost. So there is no QueryPanel.

What a person sees:

1. Scores computed live from the graph (digestion, coverage, contested, orphans, single-source, …);
2. Eleven locked questions (which orphans, which claims are thin);
3. One next-action sentence;
4. Ad-hoc questions handed to an agent in natural language.

QQL is still there: MCP `run_qql`, the desktop health sweep, `health/*.md` in the starter. It is an intermediate representation for programs and agents, not a language for you to type.

## Two agent paths

They solve different jobs. Do not mash them into one.

| | In-app agent | External agent (MCP) |
| --- | --- | --- |
| Where you chat | Right sidebar | Cursor / Claude Code / another editor |
| How it attaches | A recipe installed on this machine (ACP) | `open-llm-wiki-mcp` registered in that editor |
| Raw transcript | Stays in the app’s SQLite, not in the vault | Stays in that editor’s own history |
| What enters the vault | Only files you (or the agent via `write_note`) explicitly write | Same: only what lands in files |

`hot.md` is a short cache for the next session, not a chat log. The in-app agent reads it and, after a write, asks you to rewrite it. External agents should read it first too.

## The flywheel

If you follow wiki-starter:

```
ingest (eat a Source) → emit Summary / Entity / Concept
        ↑                         ↓
  next source?  ←  research / health shows the gaps
```

Health’s hungriest claims and the frontier list answer: which page to enrich next, and whom it should link to. You do not have to become an archivist first.

## How this is not “another notes app”

Most notes apps sell the editing surface. This one makes **relationships** and **measurable gaps** first-class, and lets an agent read and write the same graph, without locking files into a proprietary format.

The graph is not decoration. Health is not a toy dashboard. They are two faces of one relationship graph: one shows the structure, the other shows where the structure is thin.
