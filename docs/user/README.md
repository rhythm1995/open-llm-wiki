# Open LLM Wiki user guide

<!-- README-I18N:START -->

**English** | [简体中文](./README.zh.md)

<!-- README-I18N:END -->

For **people who use the app**. Design specs for contributors live in [../README.md](../README.md).

A vault is a folder of Markdown on your machine. The app compiles sources into a wiki, shows the links as a graph, lints the graph as Health, and lets any agent use that same folder as long-term memory. There is no account and no second database.

![Three-pane editor: navigation, body, backlinks](./images/editor-en.png)

## How to read this

The set follows [Diátaxis](https://diataxis.fr/). Open only the kind you need:

| Kind | You are… | Open |
| --- | --- | --- |
| **Tutorial** | First launch. You want one successful pass | [Tutorial](./tutorial.md) |
| **How-to** | Already in a vault. You need to finish a job | [How-to](./how-to.md) |
| **Reference** | Looking up a shortcut, view, field, or MCP tool | [Reference](./reference.md) |
| **Concepts** | Wanting the “why” | [Concepts](./concepts.md) |

In the app: Help → **User Guide**, or click the logo next to `⌘K`.

## Five rules

The long form is [Concepts](./concepts.md).

1. **Files are the truth.** The `.md` files in Finder are the notes. Leave with the folder.
2. **Compile, don't retrieve.** Distill a Source once. Later questions read those pages, not raw chunks.
3. **The vault is the memory.** In-app ACP and one-click MCP attach to the same files. Chat is not memory.
4. **Links over folders.** Put relationships in `[[wikilinks]]` and frontmatter. `type:` never blocks a save.
5. **Health, not a query language.** Read scores and the next action. Ask Agent for ad-hoc questions.
