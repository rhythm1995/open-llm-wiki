# Open LLM Wiki — design docs

<!-- README-I18N:START -->

**English** | [简体中文](./README.zh.md)

<!-- README-I18N:END -->

To **use** the app (install, write notes, graph, health, agents), start with the **[user guide](./user/README.md)** ([简体中文](./user/README.zh.md)). The marketing site in [`site/`](../site/) renders those same Markdown files under `/docs`. Everything below is for contributors and coding agents.

## Quick entry

| You want… | Open |
|---|---|
| **I am a user; teach me the app** | [**user/README.md**](./user/README.md) |
| **Shipped feature → code** | [**FEATURE-INDEX.md**](./FEATURE-INDEX.md) |
| **Not done / slice order** | [**plan.md**](./plan.md) + [backlog.md](./backlog.md) |
| **Still undecided** | [open-questions.md](./open-questions.md) |
| **Architecture layers** | [02-architecture.md](./02-architecture.md) · [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) |

## Document map

The numbered specs and research notes are written in Chinese (implementation source of truth). The user guide above is English by default.

| Doc | Answers | Status |
|---|---|---|
| [user/README.md](./user/README.md) | **User guide** (tutorial / how-to / reference / concepts; bilingual) | maintained |
| [FEATURE-INDEX.md](./FEATURE-INDEX.md) | **Shipped feature index** (name → code) | maintained |
| [plan.md](./plan.md) | **Unfinished implementation plan** | maintained |
| [backlog.md](./backlog.md) | ID status table | maintained |
| [01-vision.md](./01-vision.md) | Positioning, principles, vs O/T | stable |
| [02-architecture.md](./02-architecture.md) | Stack, layers, IPC | updated with the code |
| [03-data-model.md](./03-data-model.md) | vault / note / relation definitions | stable |
| [04-features.md](./04-features.md) | Feature catalog spec | status checked against backlog |
| [05-tdd-strategy.md](./05-tdd-strategy.md) | Test strategy | stable |
| [06-roadmap.md](./06-roadmap.md) | Phase narrative | history + forward |
| [07-llm-wiki-architecture.md](./07-llm-wiki-architecture.md) | Implementation truth + mermaid | updated with the code |
| [08-media-and-split-preview.md](./08-media-and-split-preview.md) | Attachments / media spec | updated with media work |
| [09-big-features-v1.md](./09-big-features-v1.md) | SHEET / PLUGIN / MCP slices | shipped reference |
| [10-menus-and-search.md](./10-menus-and-search.md) | Menus / commands / search | shipped reference |
| [11-in-app-agent-roadmap.md](./11-in-app-agent-roadmap.md) | In-app agent (ACP-hosted) | shipped (Phase 7; desktop acceptance done 2026-08-19) |
| [12-graph-and-agent-roadmap.md](./12-graph-and-agent-roadmap.md) | Graph polish → external agent (MCP) | 6A deferred; 6B MCP + **health / Ask Agent** shipped; 6D shipped; do not rebuild QueryPanel |
| [13-client-logging.md](./13-client-logging.md) | Client logging | shipped reference |
| [14-llm-wiki-workflow.md](./14-llm-wiki-workflow.md) | LLM Wiki workflow (ingest / research / consolidate) + distill L2a + lint L1/L2 | shipped reference (still growing) |
| [15-owf-format.md](./15-owf-format.md) | **OWF-1 format** (binding + version pin; `format: owf/1` + tolerant rules; archive of alternatives in §9) | in force |
| [16-first-run-mg-philosophy.md](./16-first-run-mg-philosophy.md) | First-run philosophy MG: narrative + brand constraints + **reproducible prompts** | reviewed v4; embedded in WelcomeEmpty |
| [research/agent-memory-survey.md](./research/agent-memory-survey.md) | Agent long-term memory survey (40 sources / 54 evidence); **§7.4 = priority order for the four follow-ups** | reference |
| [research/conversation-to-vault-distillation.md](./research/conversation-to-vault-distillation.md) | Conversation → vault distillation | L2a is in doc 14 §1.1; L1/L2b UI waits on signal |
| [research/trust-provenance-frontmatter.md](./research/trust-provenance-frontmatter.md) | Trust / provenance frontmatter | **P0 L1 shipped** (starter + Health) |
| [research/content-lint-contradiction.md](./research/content-lint-contradiction.md) | Content lint / contradiction | **L1 core shipped**; L2 workflow shipped (doc 14 §3.2.3); no MCP/UI yet |
| [research/semantic-retrieval.md](./research/semantic-retrieval.md) | Semantic retrieval (off by default; trigger quantified) | candidate |
| [research/openkb-survey.md](./research/openkb-survey.md) | OpenKB survey | reference |
| [research/canvas-isolation.md](./research/canvas-isolation.md) | Canvas isolation from graph / QQL / wikilink / search | shipped reference |
| [open-questions.md](./open-questions.md) | Still undecided | maintained |

## One-liner

**Local-first, file-as-truth, Apache-2.0 knowledge-base app.** Original implementation. Graph visualization and live aggregation are native first-class features. Types are optional conventions.

## Legal note

Apache-2.0. Original independent implementation; public ideas and feature comparison only; **no verbatim copyleft source**. See the root [README](../README.md).
