# Open LLM Wiki — brand mark lock

**Status:** locked (raster only)  
**Source of truth:** [`olw-vi-board.jpg`](./olw-vi-board.jpg) **panels 1–3** (hero / construction / app icon)

## Keep (approved)

| File | Role |
|---|---|
| `olw-vi-board.jpg` | Full board reference |
| `olw-mark-canonical.jpg` | Clean hero mark (from board) |
| `olw-mark-from-vi.jpg` | Same lineage, VI extract |
| `olw-mark-1024.png` | Dark square master |
| `olw-mark.png` / `olw-mark-transparent.png` | UI mark (transparent) |
| `app-icon-canonical.jpg` | App tile from board panel 3 |
| `app-icon-1024.png` | App icon master |
| `app-icon-flat-1024.png` | Full-bleed dock source for Tauri |
| `mg-philosophy.html` | First-run MG review (not shipped in app yet) |
| `LOCK.md` | This file |

MG narrative / regenerate prompts: [`docs/16-first-run-mg-philosophy.md`](../docs/16-first-run-mg-philosophy.md).

## Deleted / forbidden

- **All brand SVGs** (wrong geometry / proportions — dense faceted mesh)
- `render_mark.py` (generated wrong SVGs)
- Early explorations `olw-mark-primary.jpg`, `olw-mark-variants.jpg`

Do **not** re-add hand-coded mark SVGs unless they are traced 1:1 from the approved raster and reviewed against panels 1–3.

## Palette

| Token | Hex |
|---|---|
| Near black | `#050A16` |
| Charcoal | `#1F2A3C` |
| Sky blue | `#7FC8FF` |
| Soft steel | `#8A9AA6` |

## Ship paths

- Tauri icons: `app/src-tauri/icons/*` ← from `app-icon-flat-1024.png`
- Web: `ui/public/olw-mark.png`, favicons from the same mark
- Welcome: `/olw-mark.png`

## Regenerate icons (raster only)

```bash
pnpm --dir ui exec tauri icon "$PWD/brand/app-icon-flat-1024.png" \
  -o "$PWD/app/src-tauri/icons" --ios-color '#050A16'
# ensure RGBA
python3 -c "from PIL import Image; from pathlib import Path
for p in Path('app/src-tauri/icons').rglob('*.png'):
  im=Image.open(p)
  if im.mode!='RGBA': im.convert('RGBA').save(p)"
```
