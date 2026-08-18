export type Locale = "en" | "zh";

export function parseLocale(value: string | null): Locale {
  return value === "zh" ? "zh" : "en";
}

export const copy = {
  en: {
    docs: "Docs",
    github: "GitHub",
    getApp: "Get the app",
    readDocs: "Read the docs",
    heroEyebrow: "01 · Open LLM Wiki",
    heroTitle: "Files are the truth.",
    heroSub:
      "A local knowledge base. Graph, health, and agents on your machine. No account.",
    quote:
      "A vault is a folder. Leave whenever you want. Take the files with you.",
    quoteBy: "Open LLM Wiki",
    quoteRole: "file-as-truth",
    essayEyebrow: "02 · Why",
    essayP1:
      "Knowledge apps either lock the engine or hand you a query language. The notes stay useful only while you stay inside the product.",
    essayP2:
      "Open LLM Wiki is an original Apache-2.0 desktop app. Wikilinks become a graph you can see. Health tells you what to fix next. Agents read and write the same files you do.",
    sitEyebrow: "03 · Where it sits",
    sitTitle: "A layer between you and the folder.",
    sitLead: "The app never owns the data. It only lights the lattice.",
    pillar1Label: "The files",
    pillar1Title: "Markdown on disk.",
    pillar1Body:
      "Every note is an ordinary file. Git, Finder, and any editor see the same truth.",
    pillar2Label: "The lattice",
    pillar2Title: "Links, scored.",
    pillar2Body:
      "Wikilinks and frontmatter become a graph. Health names orphans, thin claims, and the next action.",
    pillar3Label: "The agents",
    pillar3Title: "In-app or MCP.",
    pillar3Body:
      "ACP in the sidebar, or Cursor and Claude Code through eight built-in tools. Transcripts stay out of the vault.",
    surfacesEyebrow: "04 · Surfaces",
    surfacesTitle: "Editor, graph, health.",
    editorCap: "Editor and backlinks",
    graphCap: "Insight lattice",
    healthCap: "Vault health",
    docsEyebrow: "05 · Handbook",
    docsTitle: "From the user guide.",
    docsBody:
      "The same Markdown in the repository. This menu renders it. English is the default.",
    viewAll: "View all",
    faqEyebrow: "06 · FAQ",
    faqTitle: "Before you open a vault",
    faqLead: "Short answers. The handbook has the rest.",
    closeCta: "Take the folder with you.",
    closeBody:
      "Build from source today. Prebuilt apps land on GitHub Releases when published.",
    langSwitch: "中文",
    footerHint: "Apache-2.0. Original implementation.",
    jump: "Jump sections",
  },
  zh: {
    docs: "文档",
    github: "GitHub",
    getApp: "获取应用",
    readDocs: "阅读文档",
    heroEyebrow: "01 · Open LLM Wiki",
    heroTitle: "文件即真相。",
    heroSub: "本地知识库。图谱、库健康、Agent，都在你的机器上。无需账号。",
    quote: "Vault 就是一个文件夹。想走，带上文件即可。",
    quoteBy: "Open LLM Wiki",
    quoteRole: "文件即真相",
    essayEyebrow: "02 · 为什么",
    essayP1:
      "知识应用要么锁引擎，要么丢给你一门查询语言。笔记只在你留在产品里时才好用。",
    essayP2:
      "Open LLM Wiki 是原创的 Apache-2.0 桌面应用。Wikilink 变成能看见的图。库健康告诉你下一步修什么。Agent 读写的是同一批文件。",
    sitEyebrow: "03 · 它站在哪",
    sitTitle: "你和文件夹之间的一层。",
    sitLead: "应用从不拥有数据。它只把晶格点亮。",
    pillar1Label: "文件",
    pillar1Title: "磁盘上的 Markdown。",
    pillar1Body: "每篇笔记都是普通文件。Git、访达、任何编辑器看到的是同一份真相。",
    pillar2Label: "晶格",
    pillar2Title: "链接，被量过。",
    pillar2Body: "Wikilink 和 frontmatter 变成图谱。库健康标出孤儿、薄主张和下一步。",
    pillar3Label: "Agent",
    pillar3Title: "应用内，或 MCP。",
    pillar3Body: "侧栏走 ACP，或 Cursor / Claude Code 走八个内置工具。转录不进 vault。",
    surfacesEyebrow: "04 · 界面",
    surfacesTitle: "编辑器、图谱、库健康。",
    editorCap: "编辑器与反链",
    graphCap: "洞察晶格",
    healthCap: "库健康",
    docsEyebrow: "05 · 手册",
    docsTitle: "从用户文档里来。",
    docsBody: "仓库里的同一批 Markdown。这个菜单负责渲染。默认英文。",
    viewAll: "查看全部",
    faqEyebrow: "06 · 问答",
    faqTitle: "打开一座库之前",
    faqLead: "短答。细节在手册里。",
    closeCta: "把文件夹带走即可。",
    closeBody: "现在可以从源码构建。预编译包发布后放在 GitHub Releases。",
    langSwitch: "EN",
    footerHint: "Apache-2.0。原创实现。",
    jump: "跳转章节",
  },
} as const;

export const faqs = {
  en: [
    {
      q: "Where do my notes live?",
      a: "In a folder of Markdown files on your disk. The app does not keep a second database. Leave whenever you want. Take the files.",
    },
    {
      q: "Do I need an account?",
      a: "No. There is no cloud sync and no login. Preferences stay on this machine.",
    },
    {
      q: "What is vault health?",
      a: "A board of locked questions: orphans, thin claims, unreviewed pages. It does not teach a query language. Ad-hoc questions go to Ask Agent.",
    },
    {
      q: "Can an agent write the vault?",
      a: "Yes, if you ask it to. In-app Agent uses ACP. External editors use the built-in MCP server. Raw chat transcripts do not enter the vault.",
    },
    {
      q: "Is this a copy of Obsidian?",
      a: "No. It is an original Apache-2.0 implementation. Obsidian is a public feature comparison only. Source is not copied.",
    },
  ],
  zh: [
    {
      q: "笔记存在哪里？",
      a: "磁盘上的 Markdown 文件夹。应用不另存一份数据库。想走，带上文件即可。",
    },
    {
      q: "需要账号吗？",
      a: "不需要。没有云同步，也没有登录。偏好只存在这台机器上。",
    },
    {
      q: "库健康是什么？",
      a: "一组锁死的问题：孤儿、薄主张、未复审页。它不教查询语言。临时问题交给「问 Agent」。",
    },
    {
      q: "Agent 能写库吗？",
      a: "你允许就可以。应用内走 ACP，外部编辑器走内置 MCP。原始对话不会进 vault。",
    },
    {
      q: "这是 Obsidian 的复制品吗？",
      a: "不是。这是原创的 Apache-2.0 实现。Obsidian 只作公开功能对照，源码未复制。",
    },
  ],
} as const;
