#!/usr/bin/env bash
# build-app.sh — 构建可直接运行的 .app(不打 dmg、免安装)。
#
# 用法:
#   bash scripts/build-app.sh      # 或在仓库根:pnpm build:app
#
# 产物:
#   target/release/bundle/macos/Open LLM Wiki.app   ← 可直接 `open` / 双击运行
#
# 与 `tauri build`(默认 --bundles all)的区别:跳过 dmg 打包,
# 只产出独立 .app;本地构建无 quarantine 标记,无需安装即可运行。
set -euo pipefail

# 定位仓库根(脚本所在目录的父目录),不依赖调用方 cwd。
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── 确保 pnpm 可用 ──────────────────────────────────────────
# 交互式 shell 通常已通过 nvm 加载好;非交互(如 CI / 守护进程)下手动补 PATH。
if ! command -v pnpm >/dev/null 2>&1; then
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # nvm.sh 在 set -u 下会报未定义变量,临时关闭。
    set +u; . "$NVM_DIR/nvm.sh"; set -u
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  # 最后回落:nvm 已安装的某个版本目录(取首个带 pnpm 的)。
  for cand in "$HOME/.nvm/versions/node"/v*/bin; do
    [ -x "$cand/pnpm" ] && export PATH="$cand:$PATH" && break
  done
fi
command -v pnpm >/dev/null 2>&1 || {
  echo "✗ 找不到 pnpm。先装好 node + pnpm(npm i -g pnpm),或在 ui/ 下确保依赖已装。" >&2
  exit 1
}

TAURI="$ROOT/ui/node_modules/.bin/tauri"
[ -x "$TAURI" ] || { echo "✗ 找不到 tauri 二进制($TAURI)。先在 ui/ 下 pnpm install。" >&2; exit 1; }

echo "▸ 准备 open-llm-wiki-mcp sidecar(Tauri externalBin + 同目录嵌入)…"
bash "$ROOT/scripts/prepare-mcp-sidecar.sh" --release

echo "▸ 构建独立 .app(--bundles app,跳过 dmg,免安装)…"
"$TAURI" build --bundles app

APP="$ROOT/target/release/bundle/macos/Open LLM Wiki.app"
MCP_BIN="$ROOT/target/release/open-llm-wiki-mcp"
echo
if [ -d "$APP" ]; then
  # 双保险:externalBin 应已嵌入;若缺失再手动拷进 Contents/MacOS/
  # (resolve_mcp_binary 同目录命中 → 用户无需手填路径)。
  MACOS_DIR="$APP/Contents/MacOS"
  EMBEDDED="$MACOS_DIR/open-llm-wiki-mcp"
  if [ ! -x "$EMBEDDED" ]; then
    if [ -x "$MCP_BIN" ]; then
      cp -f "$MCP_BIN" "$EMBEDDED"
      chmod +x "$EMBEDDED"
      echo "✓ 已补嵌入 open-llm-wiki-mcp → Contents/MacOS/"
    else
      echo "✗ 未找到 open-llm-wiki-mcp($MCP_BIN),一键接入会失败。请检查 prepare-mcp-sidecar。" >&2
      exit 1
    fi
  else
    echo "✓ open-llm-wiki-mcp 已在 Contents/MacOS/(externalBin 或既有)"
  fi
  echo "✓ 完成。可直接运行(无需安装):"
  echo "    open \"$APP\""
else
  echo "✗ 构建结束但未找到 $APP —— 检查上方日志。" >&2
  exit 1
fi
