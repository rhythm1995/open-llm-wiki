# Open LLM Wiki site

Marketing site plus a renderer for the user handbook.

Markdown is **not copied**. Vite imports files from [`../docs/user`](../docs/user) at build time. Edit the handbook there; this app only catalogs slugs and renders them.

Motion is GSAP (ScrollTrigger, SplitText, DrawSVG) with `@gsap/react` cleanup. Prefer reduced-motion falls back to static layout.

```
docs/user/*.md  ──import.meta.glob──►  /docs/:slug
docs/user/images/*  ──/docs-media──►  img src in the article
```

## Commands

```bash
pnpm --dir site install
pnpm --dir site dev        # http://127.0.0.1:5174
pnpm --dir site typecheck
pnpm --dir site build      # SITE_BASE=/open-llm-wiki/ for GitHub Pages
```

## GitHub Pages

Workflow: [`.github/workflows/site.yml`](../.github/workflows/site.yml). It typechecks and builds on every change to `site/` or `docs/user/`, and deploys the `site/dist` artifact to Pages.
