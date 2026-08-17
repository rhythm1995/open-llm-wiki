# Open LLM Wiki user guide

<!-- README-I18N:START -->

**English** | [简体中文](./README.zh.md)

<!-- README-I18N:END -->

This is for **people who use the app**, not people who change the source. Design docs live in [../README.md](../README.md).

Open LLM Wiki treats a folder of Markdown files on your machine as a knowledge base (a vault). Notes are files. Links become a graph. Vault health tells you what to fix next.

![Three-pane editor: navigation, body, backlinks](./images/editor-en.png)

## How to read this

The set follows [Diátaxis](https://diataxis.fr/). Open only the kind you need right now:

| Kind | You are… | Open |
| --- | --- | --- |
| **Tutorial** | Opening the app for the first time and want one successful pass | [Tutorial](./tutorial.md) |
| **How-to** | Already in a vault and need to finish a job | [How-to](./how-to.md) |
| **Reference** | Looking up a shortcut, view, or field | [Reference](./reference.md) |
| **Concepts** | Wanting the “why” | [Concepts](./concepts.md) |

In the app, click the logo next to `⌘K` any time for the short built-in overview.

## Three things to keep

1. **A vault is a folder.** There is no proprietary database. The `.md` files you can see in Finder are the notes.
2. **Connect notes with `[[wikilinks]]`, not folders.** The graph and backlinks are computed from those links.
3. **Do not learn a query language.** Use **Health**. Ad-hoc questions go to **Ask Agent**.

Screenshots are from the browser mock preview (same UI as the desktop app). Health QQL details evaluate only on desktop; the mock still shows live graph scores.
