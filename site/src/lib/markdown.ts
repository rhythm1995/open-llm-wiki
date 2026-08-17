import DOMPurify from "dompurify";
import { marked } from "marked";

const FILE_TO_SLUG: Record<string, string> = {
  "README.md": "start",
  "README.zh.md": "start",
  "tutorial.md": "tutorial",
  "tutorial.zh.md": "tutorial",
  "how-to.md": "how-to",
  "how-to.zh.md": "how-to",
  "reference.md": "reference",
  "reference.zh.md": "reference",
  "concepts.md": "concepts",
  "concepts.zh.md": "concepts",
};

function stripChrome(src: string): string {
  return src
    .replace(/<!--\s*README-I18N:START\s*-->[\s\S]*?<!--\s*README-I18N:END\s*-->/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function rewriteAdmonitions(src: string): string {
  return src.replace(
    /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*\n?)*)/gim,
    (_m, kind: string, body: string) => {
      const text = body
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      return `\n<div class="admonition"><span class="admonition-label">${kind}</span>\n\n${text}\n\n</div>\n`;
    },
  );
}

function rewriteWikiLinks(href: string, locale: "en" | "zh"): string {
  const clean = href.split("#")[0] ?? href;
  const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
  const base = clean.replace(/^\.\//, "");
  if (base.startsWith("images/")) {
    const file = base.slice("images/".length);
    return `${import.meta.env.BASE_URL}docs-media/${file}`;
  }
  if (FILE_TO_SLUG[base]) {
    const slug = FILE_TO_SLUG[base];
    const lang = base.endsWith(".zh.md") ? "zh" : locale;
    const q = lang === "zh" ? "?lang=zh" : "";
    return `${import.meta.env.BASE_URL}docs/${slug}${q}${hash}`;
  }
  if (clean.startsWith("../")) {
    return `${import.meta.env.BASE_URL}${hash}`;
  }
  return href;
}

export function renderUserMarkdown(source: string, locale: "en" | "zh"): string {
  const prepared = rewriteAdmonitions(stripChrome(source));
  const html = marked.parse(prepared, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  const withLinks = html.replace(
    /href="([^"]+)"/g,
    (_m, href: string) => {
      if (/^(https?:|mailto:|#)/i.test(href)) {
        const extra = href.startsWith("http")
          ? ' target="_blank" rel="noreferrer"'
          : "";
        return `href="${href}"${extra}`;
      }
      return `href="${rewriteWikiLinks(href, locale)}"`;
    },
  );

  const withImages = withLinks.replace(
    /src="(\.\/images\/[^"]+)"/g,
    (_m, src: string) => `src="${rewriteWikiLinks(src, locale)}"`,
  );

  return DOMPurify.sanitize(withImages, {
    ADD_ATTR: ["target", "rel"],
    ADD_TAGS: ["div", "span"],
  });
}
