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
    latticeTitle: "Links form a lattice",
    latticeBody:
      "Notes stay Markdown on disk. Wikilinks and frontmatter become a graph you can see, score, and hand to an agent.",
    surfacesEyebrow: "02 · Surfaces",
    surfacesTitle: "Editor, graph, health.",
    editorCap: "Editor and backlinks",
    graphCap: "Insight lattice",
    healthCap: "Vault health",
    flywheelEyebrow: "03 · Method",
    flywheelTitle: "Eat a source. Measure the gaps.",
    flywheelBody:
      "Ingest a Source, emit Summary and Concept pages, then let Health name the next thin claim. Nobody has to learn a query language.",
    docsEyebrow: "04 · Handbook",
    docsTitle: "The user guide, as pages.",
    docsBody:
      "The same Markdown in the repository. This menu renders it. English is the default.",
    faqEyebrow: "05 · FAQ",
    faqTitle: "Before you open a vault",
    faqLead: "Short answers. The handbook has the rest.",
    closeCta: "Take the folder with you.",
    closeBody:
      "Build from source today. Prebuilt apps land on GitHub Releases when published.",
    langSwitch: "中文",
    footerHint: "Apache-2.0. Original implementation.",
  },
  zh: {
    docs: "文档",
    github: "GitHub",
    getApp: "获取应用",
    readDocs: "阅读文档",
    heroEyebrow: "01 · Open LLM Wiki",
    heroTitle: "文件即真相。",
    heroSub: "本地知识库。图谱、库健康、Agent，都在你的机器上。无需账号。",
    latticeTitle: "链接织成晶格",
    latticeBody:
      "笔记就是磁盘上的 Markdown。Wikilink 和 frontmatter 变成一张能看见、能打分、能交给 Agent 的图。",
    surfacesEyebrow: "02 · 界面",
    surfacesTitle: "编辑器、图谱、库健康。",
    editorCap: "编辑器与反链",
    graphCap: "洞察晶格",
    healthCap: "库健康",
    flywheelEyebrow: "03 · 方法",
    flywheelTitle: "吃进一篇来源，量出缺口。",
    flywheelBody:
      "Ingest 一篇 Source，产出 Summary 和 Concept，再让库健康指出最薄的主张。不必学查询语言。",
    docsEyebrow: "04 · 手册",
    docsTitle: "用户文档，按页打开。",
    docsBody: "仓库里的同一批 Markdown。这个菜单负责渲染。默认英文。",
    faqEyebrow: "05 · 问答",
    faqTitle: "打开一座库之前",
    faqLead: "短答。细节在手册里。",
    closeCta: "把文件夹带走即可。",
    closeBody: "现在可以从源码构建。预编译包发布后放在 GitHub Releases。",
    langSwitch: "EN",
    footerHint: "Apache-2.0。原创实现。",
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
