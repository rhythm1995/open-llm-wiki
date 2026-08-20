/**
 * open-llm-wiki-skills CLI —— 用户契约:list / install 双写 / --force / --no-hooks / 拒非目录。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(pkgRoot, "bin/olw-skills.mjs");

function run(args, cwd) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    cwd: cwd ?? pkgRoot,
  });
}

function tmpVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "olw-skills-"));
}

test("list 打印 wiki-ingest", () => {
  const r = run(["list"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /wiki-ingest/);
});

test("help 退出 0", () => {
  const r = run(["help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /install/);
});

test("未知命令退出 1", () => {
  const r = run(["nope"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown command/);
});

test("install 非目录退出 1", () => {
  const r = run(["install", path.join(os.tmpdir(), "olw-missing-vault")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Not a directory/);
});

test("install 双写 skill 到 .agents 与 .claude,默认带 hooks", () => {
  const vault = tmpVault();
  const r = run(["install", vault]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const skillA = path.join(vault, ".agents/skills/wiki-ingest/SKILL.md");
  const skillC = path.join(vault, ".claude/skills/wiki-ingest/SKILL.md");
  assert.equal(fs.existsSync(skillA), true);
  assert.equal(fs.existsSync(skillC), true);
  assert.equal(fs.existsSync(path.join(vault, "AGENTS.md")), true);
  assert.equal(
    fs.existsSync(path.join(vault, ".agents/hooks/olw-post-write.mjs")),
    true,
  );
  assert.match(r.stdout, /written=/);
});

test("二次 install 无 --force 跳过已有文件", () => {
  const vault = tmpVault();
  run(["install", vault]);
  const skill = path.join(vault, ".agents/skills/wiki-ingest/SKILL.md");
  fs.writeFileSync(skill, "KEEP\n");
  const r = run(["install", vault]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(skill, "utf8"), "KEEP\n");
  assert.match(r.stdout, /skipped=/);
});

test("--force 覆盖 skill", () => {
  const vault = tmpVault();
  run(["install", vault]);
  const skill = path.join(vault, ".agents/skills/wiki-ingest/SKILL.md");
  fs.writeFileSync(skill, "KEEP\n");
  const r = run(["install", vault, "--force"]);
  assert.equal(r.status, 0, r.stderr);
  const body = fs.readFileSync(skill, "utf8");
  assert.notEqual(body, "KEEP\n");
  assert.match(body, /wiki-ingest|ingest/i);
});

test("--no-hooks 不写 hooks 模板", () => {
  const vault = tmpVault();
  const r = run(["install", vault, "--no-hooks"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    fs.existsSync(path.join(vault, ".agents/hooks/olw-post-write.mjs")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(vault, ".agents/skills/wiki-ingest/SKILL.md")),
    true,
  );
});

test("已有 AGENTS.md 含 wiki-ingest 时 --force 也不重复追加", () => {
  const vault = tmpVault();
  fs.writeFileSync(path.join(vault, "AGENTS.md"), "# hi\nwiki-ingest already\n");
  run(["install", vault, "--force"]);
  const body = fs.readFileSync(path.join(vault, "AGENTS.md"), "utf8");
  const hits = body.split("wiki-ingest").length - 1;
  assert.equal(hits, 1);
});
