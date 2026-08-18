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
      "A compiled Markdown wiki on your disk. Graph, health, and AI memory — no account.",
    quote: "The folder is the wiki. The folder is the memory.",
    quoteBy: "Open LLM Wiki",
    quoteRole: "compile, then remember",
    essayEyebrow: "02 · Why",
    essayP1:
      "Most LLM-and-documents products retrieve chunks, answer, and throw the synthesis away. The next question starts from zero. Other knowledge apps lock the engine or hand you a query language.",
    essayP2:
      "This app compiles sources into linked pages you keep. Distill ingests. Health lints. Cursor, Claude Code, and the in-app agent attach to the same folder. You do not write QQL. You leave with the files.",
    sitEyebrow: "03 · Principles",
    sitTitle: "Five rules.",
    sitLead: "Product constraints, not a feature list. The handbook is the long form.",
    surfacesEyebrow: "04 · Surfaces",
    surfacesTitle: "Editor, graph, health, memory.",
    editorCap: "Editor and backlinks",
    graphCap: "Insight lattice",
    healthCap: "Vault health",
    agentCap: "The vault as memory",
    docsEyebrow: "05 · Handbook",
    docsTitle: "From the user guide.",
    docsBody:
      "The same Markdown in the repository. This site renders it. English is the default.",
    viewAll: "View all",
    faqEyebrow: "06 · FAQ",
    faqTitle: "Before you open a vault",
    faqLead: "Short answers. The handbook has the rest.",
    closeCta: "When you leave, the wiki leaves with you.",
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
    heroSub: "本机上一座编好的 Markdown wiki。图谱、库健康、AI 记忆。无需账号。",
    quote: "文件夹就是 wiki。文件夹就是记忆。",
    quoteBy: "Open LLM Wiki",
    quoteRole: "先编译，再记住",
    essayEyebrow: "02 · 为什么",
    essayP1:
      "多数「LLM + 文档」产品取出片段、给出答案、把综合扔掉。下一问又从零开始。其它知识应用要么锁引擎，要么丢给你一门查询语言。",
    essayP2:
      "这座应用把源编译成你留下的链接页。提炼是消化，库健康是 lint。Cursor、Claude Code 和应用内 Agent 接到同一座文件夹。你不用写 QQL。想走，带走文件。",
    sitEyebrow: "03 · 原则",
    sitTitle: "五条规则。",
    sitLead: "产品约束，不是功能清单。展开在手册里。",
    surfacesEyebrow: "04 · 界面",
    surfacesTitle: "编辑器、图谱、库健康、记忆。",
    editorCap: "编辑器与反链",
    graphCap: "洞察晶格",
    healthCap: "库健康",
    agentCap: "Vault 就是记忆",
    docsEyebrow: "05 · 手册",
    docsTitle: "从用户文档里来。",
    docsBody: "仓库里的同一批 Markdown。这个站点负责渲染。默认英文。",
    viewAll: "查看全部",
    faqEyebrow: "06 · 问答",
    faqTitle: "打开一座库之前",
    faqLead: "短答。细节在手册里。",
    closeCta: "你走的时候，wiki 跟你一起走。",
    closeBody: "现在可以从源码构建。预编译包发布后放在 GitHub Releases。",
    langSwitch: "EN",
    footerHint: "Apache-2.0。原创实现。",
    jump: "跳转章节",
  },
} as const;

export const principles = {
  en: [
    {
      n: "01",
      label: "Files",
      title: "Files are the truth.",
      body: "A vault is a folder of Markdown. No account, no hidden database. Leave with the files.",
    },
    {
      n: "02",
      label: "Compile",
      title: "Compile, don't retrieve.",
      body: "Ingest a source once. Ask the wiki. File a useful answer back. Do not rebuild a synthesis from chunks every time.",
    },
    {
      n: "03",
      label: "Memory",
      title: "The vault is the memory.",
      body: "One-click MCP or the in-app agent. Same files. Chat is not memory. hot.md is only a cache.",
    },
    {
      n: "04",
      label: "Links",
      title: "Links over folders.",
      body: "Relationships live in wikilinks and frontmatter. Types label a page. They never block a save.",
    },
    {
      n: "05",
      label: "Health",
      title: "Health, not a query language.",
      body: "Scores, locked checks, a next action. QQL stays for programs and agents.",
    },
  ],
  zh: [
    {
      n: "01",
      label: "文件",
      title: "文件即真相。",
      body: "Vault 是一夹 Markdown。没有账号，没有第二份库。想走，带走文件。",
    },
    {
      n: "02",
      label: "编译",
      title: "编译，不要每次检索。",
      body: "源消化一次。问 wiki。有用的回答写回文件。不要每问一次都从片段重做综合。",
    },
    {
      n: "03",
      label: "记忆",
      title: "Vault 就是记忆。",
      body: "一键 MCP，或应用内 Agent。同一批文件。聊天不是记忆。hot.md 只是缓存。",
    },
    {
      n: "04",
      label: "链接",
      title: "链接优先于文件夹。",
      body: "关系写在 wikilink 和 frontmatter。类型只是标签，从不挡保存。",
    },
    {
      n: "05",
      label: "健康",
      title: "库健康，不是查询语言。",
      body: "分数、锁定检查、下一步。QQL 留给程序和 Agent。",
    },
  ],
} as const;

export const faqs = {
  en: [
    {
      q: "Where do my notes live?",
      a: "In a folder of Markdown on your disk. The app does not keep a second database. No account. Leave whenever you want. Take the files.",
    },
    {
      q: "Why not just upload files to a chat?",
      a: "Chat retrieves chunks and throws the synthesis away. Here a source is compiled into linked pages. The next question reads the wiki, not the raw pile.",
    },
    {
      q: "Can I use this as AI memory?",
      a: "Yes. The vault is the memory. Settings → Agent memory one-click-connects Cursor or Claude Code (eight MCP tools). The sidebar uses ACP. Chat logs stay out. hot.md is a short cache, not the wiki.",
    },
    {
      q: "Do I need a query language?",
      a: "No. Health shows scores and a next action. Ad-hoc questions go to Ask Agent. QQL exists for programs and agents, not for you to type.",
    },
    {
      q: "Is this a copy of Obsidian?",
      a: "No. It is an original Apache-2.0 implementation. Obsidian is a public feature comparison only. Source is not copied.",
    },
  ],
  zh: [
    {
      q: "笔记存在哪里？",
      a: "磁盘上的 Markdown 文件夹。应用不另存一份数据库。没有账号。想走，带上文件即可。",
    },
    {
      q: "为什么不直接把文件丢进聊天？",
      a: "聊天取出片段，把综合扔掉。这里一篇源会编译成互相链接的页面。下一问读的是 wiki，不是那堆原文。",
    },
    {
      q: "能当 AI 记忆用吗？",
      a: "能。Vault 就是记忆。设置 → Agent 记忆一键把 Cursor / Claude Code 接到八个 MCP 工具。侧栏走 ACP。聊天记录不算。hot.md 是短缓存，不是 wiki。",
    },
    {
      q: "要学查询语言吗？",
      a: "不用。库健康给出分数和下一步。临时问题点「问 Agent」。QQL 留给程序和 Agent，不是给你打字的。",
    },
    {
      q: "这是 Obsidian 的复制品吗？",
      a: "不是。这是原创的 Apache-2.0 实现。Obsidian 只作公开功能对照，源码未复制。",
    },
  ],
} as const;
