#!/usr/bin/env bash
# prepare-mcp-sidecar.sh — 编译 open-llm-wiki-mcp 并放到 Tauri externalBin 期望路径。
#
# Tauri externalBin 规则:配置 "binaries/open-llm-wiki-mcp" 时,实际文件必须是
#   app/src-tauri/binaries/open-llm-wiki-mcp-<target-triple>
# 打包后放进 Contents/MacOS/(或等价目录),与 app 同目录 → resolve_mcp_binary 同目录命中。
#
# 用法(任意 cwd 均可;脚本按自身位置找仓库根):
#   bash scripts/prepare-mcp-sidecar.sh              # host + debug
#   bash scripts/prepare-mcp-sidecar.sh --release    # host + release
#   bash scripts/prepare-mcp-sidecar.sh --release --target aarch64-apple-darwin
#   bash scripts/prepare-mcp-sidecar.sh --release --all-apple  # 双架构(universal dmg 用)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROFILE="debug"
TARGETS=()
ALL_APPLE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --release) PROFILE="release"; shift ;;
    --debug) PROFILE="debug"; shift ;;
    --target)
      [ $# -ge 2 ] || { echo "✗ --target 需要参数" >&2; exit 1; }
      TARGETS+=("$2"); shift 2
      ;;
    --all-apple)
      ALL_APPLE=1
      PROFILE="release"
      shift
      ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "✗ 未知参数: $1" >&2
      exit 1
      ;;
  esac
done

HOST="$(rustc -vV | sed -n 's/^host: //p')"
[ -n "$HOST" ] || { echo "✗ 无法读取 rustc host triple" >&2; exit 1; }

if [ "$ALL_APPLE" -eq 1 ]; then
  TARGETS=(aarch64-apple-darwin x86_64-apple-darwin)
elif [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=("$HOST")
fi

BIN_DIR="$ROOT/app/src-tauri/binaries"
mkdir -p "$BIN_DIR"

# 避免把误生成的无 triple 文件留在 binaries/(externalBin 只认带 triple 的)。
rm -f "$BIN_DIR/open-llm-wiki-mcp" "$BIN_DIR/open-llm-wiki-mcp.exe" 2>/dev/null || true

for triple in "${TARGETS[@]}"; do
  echo "▸ 构建 open-llm-wiki-mcp ($PROFILE / $triple)…"
  if [ "$triple" = "$HOST" ] && [ "$PROFILE" = "debug" ]; then
    cargo build -p open-llm-wiki-mcp
    SRC="$ROOT/target/debug/open-llm-wiki-mcp"
  elif [ "$triple" = "$HOST" ] && [ "$PROFILE" = "release" ]; then
    cargo build -p open-llm-wiki-mcp --release
    SRC="$ROOT/target/release/open-llm-wiki-mcp"
  else
    # 交叉/多架构只打 release(与 universal 流程一致)。
    cargo build -p open-llm-wiki-mcp --release --target "$triple"
    SRC="$ROOT/target/$triple/release/open-llm-wiki-mcp"
  fi

  if [ ! -x "$SRC" ]; then
    echo "✗ 未生成可执行文件: $SRC" >&2
    exit 1
  fi

  DEST="$BIN_DIR/open-llm-wiki-mcp-$triple"
  cp -f "$SRC" "$DEST"
  chmod +x "$DEST"
  echo "  → $DEST"
done

echo "✓ open-llm-wiki-mcp sidecar 已就绪 (${#TARGETS[@]} 个 target)"
