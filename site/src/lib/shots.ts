/** Product shots stored as `<name>-<en|zh>.png` in docs/user/images. */
export const SHOT_NAMES = [
  "editor",
  "graph",
  "health",
  "palette",
  "help",
  "agent",
] as const;

export type ShotName = (typeof SHOT_NAMES)[number];

const SHOT_RE = new RegExp(
  `^(${SHOT_NAMES.join("|")})(?:-(?:en|zh))?(\\.png)$`,
  "i",
);

/** Force a media filename onto the active UI locale. */
export function localizeShotFile(file: string, locale: "en" | "zh"): string {
  const base = file.split("/").pop() ?? file;
  const m = base.match(SHOT_RE);
  if (!m) return file;
  return `${m[1].toLowerCase()}-${locale}${m[2].toLowerCase()}`;
}
