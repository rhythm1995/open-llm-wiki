/**
 * Catalog of user docs. Files live in the repo at docs/user/.
 * The site never copies the Markdown; Vite imports it as raw text.
 */

export type Locale = "en" | "zh";

export interface DocPage {
  slug: string;
  file: Record<Locale, string>;
  nav: Record<Locale, string>;
  blurb: Record<Locale, string>;
}

export const DOC_PAGES: readonly DocPage[] = [
  {
    slug: "start",
    file: { en: "README.md", zh: "README.zh.md" },
    nav: { en: "Start here", zh: "从这里开始" },
    blurb: {
      en: "Five rules and the four kinds of handbook.",
      zh: "五条规则，四类手册。",
    },
  },
  {
    slug: "tutorial",
    file: { en: "tutorial.md", zh: "tutorial.zh.md" },
    nav: { en: "Tutorial", zh: "教程" },
    blurb: {
      en: "Fifteen minutes in a vault.",
      zh: "十五分钟走进一座库。",
    },
  },
  {
    slug: "how-to",
    file: { en: "how-to.md", zh: "how-to.zh.md" },
    nav: { en: "How-to", zh: "操作指南" },
    blurb: {
      en: "Recipes — including attach this vault as AI memory.",
      zh: "菜谱，含把这座库当成 AI 记忆。",
    },
  },
  {
    slug: "reference",
    file: { en: "reference.md", zh: "reference.zh.md" },
    nav: { en: "Reference", zh: "参考" },
    blurb: {
      en: "Shortcuts, Help menu, types, MCP tools.",
      zh: "快捷键、Help 菜单、类型、MCP。",
    },
  },
  {
    slug: "concepts",
    file: { en: "concepts.md", zh: "concepts.zh.md" },
    nav: { en: "Concepts", zh: "概念" },
    blurb: {
      en: "Why compile a wiki, and why the folder is memory.",
      zh: "为什么编译 wiki，以及为什么文件夹就是记忆。",
    },
  },
];

const rawModules = import.meta.glob("../../../docs/user/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function rawByFileName(name: string): string {
  const hit = Object.entries(rawModules).find(([key]) =>
    key.endsWith(`/${name}`),
  );
  if (!hit) {
    throw new Error(`User doc not found: ${name}`);
  }
  return hit[1];
}

export function pageBySlug(slug: string | undefined): DocPage {
  return DOC_PAGES.find((p) => p.slug === slug) ?? DOC_PAGES[0];
}

export function loadDocSource(page: DocPage, locale: Locale): string {
  return rawByFileName(page.file[locale]);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "zh" : "en";
}
