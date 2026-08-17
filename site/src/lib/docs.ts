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
      en: "Map of the four kinds of user docs.",
      zh: "四类用户文档的入口。",
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
      en: "Recipes for a specific job.",
      zh: "完成一件具体的事。",
    },
  },
  {
    slug: "reference",
    file: { en: "reference.md", zh: "reference.zh.md" },
    nav: { en: "Reference", zh: "参考" },
    blurb: {
      en: "Shortcuts, views, types, MCP tools.",
      zh: "快捷键、视图、类型、MCP。",
    },
  },
  {
    slug: "concepts",
    file: { en: "concepts.md", zh: "concepts.zh.md" },
    nav: { en: "Concepts", zh: "概念" },
    blurb: {
      en: "Why files are the truth.",
      zh: "为什么文件即真相。",
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
