#!/usr/bin/env node
/**
 * open-llm-wiki-skills — install agent skills (+ optional hooks templates) into a vault.
 *
 * From npm (after publish):
 *   npx open-llm-wiki-skills install [vaultDir] [--force]
 *
 * From GitHub (no npm publish required) — monorepo path:
 *   npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills open-llm-wiki-skills install .
 *   npx --yes --package=git+https://github.com/rhythm1995/open-llm-wiki.git#path:packages/open-llm-wiki-skills open-llm-wiki-skills install /path/to/vault
 *
 * Flags:
 *   --force   overwrite existing skill / hook files
 *   --no-hooks  skip hook templates (installed by default)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(PKG_ROOT, "skills");
const HOOKS_ROOT = path.join(PKG_ROOT, "hooks");

const GH_NPX =
  "npx --yes --package=github:rhythm1995/open-llm-wiki#path:packages/open-llm-wiki-skills open-llm-wiki-skills";

const INSTALL_REL_PREFIXES = [
  path.join(".agents", "skills"),
  path.join(".claude", "skills"),
];

function usage() {
  console.log(`open-llm-wiki-skills — Open LLM Wiki agent skills (+ hooks templates)

Usage:
  open-llm-wiki-skills install [vaultDir] [--force]
  open-llm-wiki-skills list
  open-llm-wiki-skills help

GitHub (no npm registry login needed):
  ${GH_NPX} install .
  ${GH_NPX} install ~/MyVault --force

  vaultDir    default: current directory
  --force     overwrite existing files
  --no-hooks  skip hook templates (installed by default)

After install, tell your agent:
  Run skill wiki-ingest on <path> using open-llm-wiki MCP tools.
`);
}

function listSkills() {
  if (!fs.existsSync(SKILLS_ROOT)) {
    console.error("No skills/ directory in package.");
    process.exit(1);
  }
  const names = fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  console.log("Packaged skills:");
  for (const n of names) {
    const skill = path.join(SKILLS_ROOT, n, "SKILL.md");
    const ok = fs.existsSync(skill) ? "ok" : "missing SKILL.md";
    console.log(`  ${n}  (${ok})`);
  }
  if (names.length === 0) console.log("  (none)");
  if (fs.existsSync(HOOKS_ROOT)) {
    console.log("Hooks templates:");
    for (const f of fs.readdirSync(HOOKS_ROOT).sort()) {
      console.log(`  hooks/${f}`);
    }
  }
}

function copyFile(src, dest, force) {
  if (fs.existsSync(dest) && !force) {
    return "skipped";
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* windows */
  }
  return "written";
}

function installSkills(vault, force) {
  let written = 0;
  let skipped = 0;
  const skillDirs = fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const name of skillDirs) {
    const src = path.join(SKILLS_ROOT, name, "SKILL.md");
    if (!fs.existsSync(src)) {
      console.warn(`skip ${name}: no SKILL.md`);
      continue;
    }
    for (const prefix of INSTALL_REL_PREFIXES) {
      const dest = path.join(vault, prefix, name, "SKILL.md");
      const r = copyFile(src, dest, force);
      console.log(`  [${r}] ${path.relative(vault, dest)}`);
      if (r === "written") written++;
      else skipped++;
    }
  }
  return { written, skipped };
}

function installHooks(vault, force) {
  let written = 0;
  let skipped = 0;
  if (!fs.existsSync(HOOKS_ROOT)) {
    console.warn("  (no hooks/ in package)");
    return { written, skipped };
  }

  const postWrite = path.join(HOOKS_ROOT, "olw-post-write.mjs");
  if (fs.existsSync(postWrite)) {
    const dest = path.join(vault, ".agents", "hooks", "olw-post-write.mjs");
    const r = copyFile(postWrite, dest, force);
    console.log(`  [${r}] ${path.relative(vault, dest)}`);
    if (r === "written") written++;
    else skipped++;
  }

  // Example configs — never overwrite user live settings by default
  const examples = [
    ["claude-settings.snippet.json", path.join(".claude", "hooks.olw.snippet.json")],
    ["cursor-hooks.example.json", path.join(".cursor", "hooks.olw.example.json")],
  ];
  for (const [name, rel] of examples) {
    const src = path.join(HOOKS_ROOT, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(vault, rel);
    const r = copyFile(src, dest, force);
    console.log(`  [${r}] ${path.relative(vault, dest)}`);
    if (r === "written") written++;
    else skipped++;
  }

  const readme = path.join(vault, ".agents", "hooks", "README.md");
  if (!fs.existsSync(readme) || force) {
    fs.mkdirSync(path.dirname(readme), { recursive: true });
    fs.writeFileSync(
      readme,
      `# Open LLM Wiki agent hooks

These are **optional** deterministic reminders after file writes.
They do **not** replace skill \`wiki-ingest\` (LLM distillation).

## Claude Code

1. Ensure this vault (or repo) is the working directory Claude Code uses.
2. Merge \`.claude/hooks.olw.snippet.json\` → \`hooks\` into:
   - project: \`.claude/settings.json\`, or
   - user: \`~/.claude/settings.json\`
3. Command runs: \`node .agents/hooks/olw-post-write.mjs\`

## Cursor

1. Open this vault folder as the project root.
2. Copy or merge \`.cursor/hooks.olw.example.json\` into \`.cursor/hooks.json\`
   (adjust event names to your Cursor version).

## Open LLM Wiki app

In-app Agent (ACP) has its own **turn-end lint check** under Settings → Agent memory.
That path does not use these files.
`,
      "utf8",
    );
    console.log(`  [written] ${path.relative(vault, readme)}`);
    written++;
  }

  return { written, skipped };
}

function installAgentsMd(vault, force) {
  const agentsSrc = path.join(PKG_ROOT, "AGENTS.snippet.md");
  const agentsDest = path.join(vault, "AGENTS.md");
  if (!fs.existsSync(agentsSrc)) return { written: 0, skipped: 0 };

  if (!fs.existsSync(agentsDest)) {
    fs.copyFileSync(agentsSrc, agentsDest);
    console.log("  [written] AGENTS.md");
    return { written: 1, skipped: 0 };
  }
  if (force) {
    const cur = fs.readFileSync(agentsDest, "utf8");
    if (!cur.includes("wiki-ingest")) {
      fs.appendFileSync(
        agentsDest,
        "\n\n" + fs.readFileSync(agentsSrc, "utf8").trim() + "\n",
      );
      console.log("  [appended] AGENTS.md (wiki-ingest pointer)");
      return { written: 1, skipped: 0 };
    }
  }
  console.log("  [skipped] AGENTS.md");
  return { written: 0, skipped: 1 };
}

function install(vaultDir, force, withHooks) {
  const vault = path.resolve(vaultDir);
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    console.error(`Not a directory: ${vault}`);
    process.exit(1);
  }
  if (!fs.existsSync(SKILLS_ROOT)) {
    console.error("Package skills/ missing.");
    process.exit(1);
  }

  console.log(`Installing Open LLM Wiki skills → ${vault}`);
  let written = 0;
  let skipped = 0;
  {
    const r = installSkills(vault, force);
    written += r.written;
    skipped += r.skipped;
  }
  {
    const r = installAgentsMd(vault, force);
    written += r.written;
    skipped += r.skipped;
  }
  if (withHooks) {
    console.log("Hooks templates:");
    const r = installHooks(vault, force);
    written += r.written;
    skipped += r.skipped;
  }

  console.log(`\nDone. written=${written} skipped=${skipped}`);
  console.log(`Vault: ${vault}`);
  console.log(
    "Tell your agent: Run skill wiki-ingest on <path> using open-llm-wiki MCP.",
  );
  if (withHooks) {
    console.log(
      "Hooks: merge .claude/hooks.olw.snippet.json / .cursor/hooks.olw.example.json (see .agents/hooks/README.md).",
    );
  }
  console.log(`\nRe-run anytime:\n  ${GH_NPX} install ${vaultDir === "." ? "." : vault}${force ? " --force" : ""}${withHooks ? " --hooks" : ""}`);
}

const args = process.argv.slice(2);
const cmd = args[0] || "help";
const flags = new Set(args.filter((a) => a.startsWith("--")));
const pos = args.filter((a) => !a.startsWith("--") && a !== cmd);

if (cmd === "help" || cmd === "-h" || cmd === "--help") {
  usage();
  process.exit(0);
}

if (cmd === "list") {
  listSkills();
  process.exit(0);
}

if (cmd === "install") {
  const force = flags.has("--force");
  // default: install hooks templates too (safe example files, not live settings)
  const withHooks = !flags.has("--no-hooks");
  const vault = pos[0] || process.cwd();
  install(vault, force, withHooks);
  process.exit(0);
}

console.error(`Unknown command: ${cmd}`);
usage();
process.exit(1);
