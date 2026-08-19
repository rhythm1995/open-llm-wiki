# Concepts

<!-- README-I18N:START -->

**English** | [简体中文](./concepts.zh.md)

<!-- README-I18N:END -->

This page is the “why”. It does not tell you what to click. Steps live in the [tutorial](./tutorial.md) and the [how-to](./how-to.md).

## Files are the truth

The app does not own your data. Every note is an ordinary Markdown file on disk. Quit the app, open the folder in another editor, clone it with git — the files are still there.

The list, the graph, backlinks, and health scores are derivatives. If a cache goes stale, a full vault scan rebuilds everything. There is no second, hidden database.

A vault is the folder you picked. No login, no vendor cloud, no hosted “my library”. Recent paths are a local preference only. Two machines, one library: move the folder with git, a drive, or whatever sync you already use. The app does not sync.

Leaving means take the `.md` files.

## Compile, don't retrieve

The usual LLM-and-documents loop is search at question time: upload files, retrieve chunks, generate an answer, throw the synthesis away. The next question starts from zero. Nothing accumulates.

This app is built for the other loop. **Raw sources stay put. The wiki is compiled and kept current.** When you distill a Source, the agent updates summaries, entities, concepts, and links. When you ask, it reads those pages. When you open Health, orphans, thin claims, and contradictions are already structure — not a one-off retrieval trick.

You can still write any page yourself. The agent is the bookkeeper, not the owner of the folder.

| Layer | Here |
| --- | --- |
| Raw sources | `type: Source` — the agent reads them and does not rewrite them |
| Wiki | Summary / Entity / Concept, plus any note you keep |
| Schema | the vault’s `AGENTS.md` and the wiki-ingest skill |

| Job | Here |
| --- | --- |
| Ingest | **Distill into Wiki** on a Source |
| Query | **Ask Agent**, then file a useful answer as a new page |
| Lint | **Vault Health** — scores, locked checks, next action |

Write raw material as `type: Source`. Write your understanding as a separate `type: Summary`. When the source changes, do not edit the old summary — mark it `Superseded` and write a new one. Leave version history to git.

A good answer that disappears into chat is a wasted compile. Write it back.

## The vault is the memory

Conversation history is not long-term memory. This is not a vector store. **The folder is the memory** — the same compiled wiki a person browses.

Two ways to attach an agent. They share files. They do not share a chat.

| | In-app agent | External agent (MCP) |
| --- | --- | --- |
| Where you chat | Right sidebar | Cursor / Claude Code / another editor |
| How it attaches | A recipe on this machine (ACP) | Settings → Agent memory → one-click connect |
| Tools | The session plus `@` notes | Eight MCP tools on the same vault |
| Raw transcript | App SQLite, not the vault | That editor’s own history |
| What becomes memory | Only files you (or `write_note`) write | Same |

`hot.md` is a short cache for the next session, not a log and not the wiki. Cheap read order: cache → `index.md` → then `read_note` / `links`.

## Links over folders

Folders are fine for attachments and drafts. They are a poor classification system. The moment the scheme changes, you have to move files.

This app keeps relationships in `[[wikilinks]]` and in frontmatter. The graph is a view of that web. You do not fill in backlinks by hand: write `[[B]]` in A, and A appears on B’s inspector.

`type:` and `status:` are labels, not cages. They never refuse a save. They only change grouping, icons, which notes Health treats as claims, and which contract an agent follows when it writes a new page. You can omit `type:` entirely. Source / Summary / Entity / Concept in wiki-starter is a **suggested method**, so agents and Health share a vocabulary.

Whether a claim is `Active` or `Contested` is a fact on that note, not a function of which folder it sits in.

## Health, not a query language

The query engine in Rust is capable. But a human-facing DSL would ask you to learn it, write it, and maintain it — cost on every layer. So there is no QueryPanel.

What a person sees:

1. Scores computed live from the graph;
2. Eleven locked questions;
3. One next-action sentence;
4. Ad-hoc questions handed to an agent in natural language.

QQL is still there: MCP `run_qql`, the background health sweep, `health/*.md` in the starter. It is an intermediate representation for programs and agents, not a language for you to type.

## The flywheel

If you follow wiki-starter:

```
ingest (eat a Source) → emit Summary / Entity / Concept
        ↑                         ↓
  next source?  ←  health shows the gaps
```

Health’s hungriest claims and the frontier list answer: which page to enrich next, and whom it should link to. You do not have to become an archivist first.

Most notes apps sell the editing surface. Most LLM-and-documents products sell retrieval. This one makes a **compiled wiki** first-class: relationships you can see, gaps you can measure, and a folder any agent can use as memory — without a proprietary store.
