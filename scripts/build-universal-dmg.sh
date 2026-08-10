#!/usr/bin/env bash
# build-universal-dmg.sh — 打 universal(apple silicon + intel)的 .dmg 安装包。
#
# 与 build-app.sh 的分工:
#   build-app.sh            → 默认日常用:仅当前架构的免安装 .app(--bundles app)
#   build-universal-dmg.sh  → 发布/分发用:双架构合一的 .dmg(--bundles dmg)
#
# 产物:
#   target/universal-apple-darwin/release/bundle/dmg/Open LLM Wiki_<version>_universal.dmg
#
# 前置:需要两个 rust target。脚本会自动 rustup target add 补齐。
# 未签名:首次打开会被 Gatekeeper 拦(同 build-app.sh),xattr -cr 即可。
#
# 用法:
#   bash scripts/build-universal-dmg.sh
set -euo pipefail

# 仅 macOS 有意义。
if [ "$(uname -s)" != "Darwin" ]; then
  echo "✗ universal dmg 仅在 macOS 上构建。" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── 确保 pnpm 可用(与 build-app.sh 同套路)──────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    set +u; . "$NVM_DIR/nvm.sh"; set -u
  fi
fi
if ! command -v pnpm >/dev/null 2>&1; then
  for cand in "$HOME/.nvm/versions/node"/v*/bin; do
    [ -x "$cand/pnpm" ] && export PATH="$cand:$PATH" && break
  done
fi
command -v pnpm >/dev/null 2>&1 || {
  echo "✗ 找不到 pnpm。先装好 node + pnpm。" >&2
  exit 1
}

TAURI="$ROOT/ui/node_modules/.bin/tauri"
[ -x "$TAURI" ] || { echo "✗ 找不到 tauri 二进制($TAURI)。先在 ui/ 下 pnpm install。" >&2; exit 1; }

# ── 确保双架构 rust target ──────────────────────────────────
TARGETS=(aarch64-apple-darwin x86_64-apple-darwin)
for t in "${TARGETS[@]}"; do
  if ! rustup target list --installed 2>/dev/null | grep -q "^${t}$"; then
    echo "▸ 安装 rust target: $t"
    rustup target add "$t"
  fi
done

echo "▸ 准备双架构 open-llm-wiki-mcp sidecar(universal externalBin)…"
bash "$ROOT/scripts/prepare-mcp-sidecar.sh" --all-apple

echo "▸ 构建 universal .dmg(--target universal-apple-darwin --bundles dmg)…"
"$TAURI" build --target universal-apple-darwin --bundles dmg

DMG_DIR="$ROOT/target/universal-apple-darwin/release/bundle/dmg"
echo
if compgen -G "$DMG_DIR/Open LLM Wiki_*.dmg" > /dev/null; then
  echo "✓ 完成。universal dmg:"
  ls -1 "$DMG_DIR"/Open LLM Wiki_*.dmg | while read -r f; do echo "    $f"; done
  echo
  echo "  未签名;拖入 /Applications 后若被 Gatekeeper 拦:"
  echo "    xattr -cr /Applications/Open LLM Wiki.app"
else
  echo "✗ 构建结束但未在 $DMG_DIR 找到 .dmg —— 检查上方日志。" >&2
  exit 1
fi
