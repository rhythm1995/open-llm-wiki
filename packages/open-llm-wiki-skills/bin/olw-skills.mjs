#!/usr/bin/env node
/**
 * open-llm-wiki-skills — copy packaged agent skills into a vault.
 *
 * Usage:
 *   npx open-llm-wiki-skills install [vaultDir] [--force]
 *   npx open-llm-wiki-skills list
 *   npx open-llm-wiki-skills help
 *
 * Install targets (same content):
 *   <vault>/.agents/skills/<name>/SKILL.md
 *   <vault>/.claude/skills/<name>/SKILL.md
 * Does not overwrite existing files unless --force.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const SKILLS_ROOT = path.join(PKG_ROOT, "skills");

const INSTALL_REL_PREFIXES = [
  path.join(".agents", "skills"),
  path.join(".claude", "skills"),
];

function usage() {
  console.log(`open-llm-wiki-skills — Open LLM Wiki agent skills

Usage:
  npx open-llm-wiki-skills install [vaultDir] [--force]
  npx open-llm-wiki-skills list
  npx open-llm-wiki-skills help

  vaultDir   default: current directory
  --force    overwrite existing SKILL.md files

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
  for (const n of names) {
    const skill = path.join(SKILLS_ROOT, n, "SKILL.md");
    const ok = fs.existsSync(skill) ? "ok" : "missing SKILL.md";
    console.log(`  ${n}  (${ok})`);
  }
  if (names.length === 0) console.log("  (none)");
}

function copyFile(src, dest, force) {
  if (fs.existsSync(dest) && !force) {
    return "skipped";
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return "written";
}

function install(vaultDir, force) {
  const vault = path.resolve(vaultDir);
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    console.error(`Not a directory: ${vault}`);
    process.exit(1);
  }
  if (!fs.existsSync(SKILLS_ROOT)) {
    console.error("Package skills/ missing.");
    process.exit(1);
  }

  const skillDirs = fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let written = 0;
  let skipped = 0;
  for (const name of skillDirs) {
    const src = path.join(SKILLS_ROOT, name, "SKILL.md");
    if (!fs.existsSync(src)) {
      console.warn(`skip ${name}: no SKILL.md`);
      continue;
    }
    for (const prefix of INSTALL_REL_PREFIXES) {
      const dest = path.join(vault, prefix, name, "SKILL.md");
      const r = copyFile(src, dest, force);
      const rel = path.relative(vault, dest) || dest;
      console.log(`  [${r}] ${rel}`);
      if (r === "written") written++;
      else skipped++;
    }
  }

  // Optional AGENTS.md pointer (never overwrite unless --force and missing section)
  const agentsSrc = path.join(PKG_ROOT, "AGENTS.snippet.md");
  const agentsDest = path.join(vault, "AGENTS.md");
  if (fs.existsSync(agentsSrc)) {
    if (!fs.existsSync(agentsDest)) {
      fs.copyFileSync(agentsSrc, agentsDest);
      console.log("  [written] AGENTS.md");
      written++;
    } else if (force) {
      const cur = fs.readFileSync(agentsDest, "utf8");
      if (!cur.includes("wiki-ingest")) {
        fs.appendFileSync(
          agentsDest,
          "\n\n" + fs.readFileSync(agentsSrc, "utf8").trim() + "\n",
        );
        console.log("  [appended] AGENTS.md (wiki-ingest pointer)");
        written++;
      } else {
        console.log("  [skipped] AGENTS.md (already mentions wiki-ingest)");
        skipped++;
      }
    } else {
      console.log("  [skipped] AGENTS.md (exists; use --force to append pointer)");
      skipped++;
    }
  }

  console.log(`\nDone. written=${written} skipped=${skipped}`);
  console.log(`Vault: ${vault}`);
  console.log(
    "Tell your agent: Run skill wiki-ingest on <path> using open-llm-wiki MCP.",
  );
}

const args = process.argv.slice(2);
const cmd = args[0] || "help";

if (cmd === "help" || cmd === "-h" || cmd === "--help") {
  usage();
  process.exit(0);
}

if (cmd === "list") {
  console.log("Packaged skills:");
  listSkills();
  process.exit(0);
}

if (cmd === "install") {
  const force = args.includes("--force");
  const pos = args.filter((a) => a !== "--force" && a !== "install");
  const vault = pos[0] || process.cwd();
  console.log(`Installing Open LLM Wiki skills → ${path.resolve(vault)}`);
  install(vault, force);
  process.exit(0);
}

console.error(`Unknown command: ${cmd}`);
usage();
process.exit(1);
