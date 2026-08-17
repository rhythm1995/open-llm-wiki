import { Link, useParams } from "react-router-dom";
import { DOC_PAGES, loadDocSource, pageBySlug } from "../lib/docs";
import { renderUserMarkdown } from "../lib/markdown";
import { copy, type Locale } from "../lib/locale";

export function DocsPage({ locale }: { locale: Locale }) {
  const { slug } = useParams();
  const page = pageBySlug(slug);
  const html = renderUserMarkdown(loadDocSource(page, locale), locale);
  const t = copy[locale];
  const q = locale === "zh" ? "?lang=zh" : "";

  return (
    <div className="mx-auto grid max-w-[1200px] gap-10 px-6 pb-24 pt-32 md:grid-cols-[220px_minmax(0,1fr)] md:pt-36">
      <aside>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-graphite">
          {t.docs}
        </p>
        <nav className="mt-4 flex flex-col" aria-label={t.docs}>
          {DOC_PAGES.map((item) => {
            const active = item.slug === page.slug;
            return (
              <Link
                key={item.slug}
                to={{ pathname: `/docs/${item.slug}`, search: q }}
                className={
                  active
                    ? "border-l border-bistre py-2 pl-3 font-display text-[18px] text-bistre"
                    : "border-l border-dashed hairline py-2 pl-3 text-[14px] text-graphite hover:text-bistre"
                }
                aria-current={active ? "page" : undefined}
              >
                {item.nav[locale]}
              </Link>
            );
          })}
        </nav>
        <p className="mt-8 text-[12px] leading-relaxed text-flint">
          {locale === "zh"
            ? "正文来自仓库 docs/user/，构建时读入，不另存一份。"
            : "Sourced from docs/user/ in this repo. Loaded at build time. Not a second copy."}
        </p>
      </aside>
      <article
        className="prose-docs"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
