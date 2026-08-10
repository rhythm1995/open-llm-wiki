#!/usr/bin/env bash
# Tauri beforeBuildCommand 钩子:编 mcp sidecar + 前端 dist。
# 兼容 CWD = 仓库根 或 app/src-tauri(脚本按自身路径定位仓库根)。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
bash "$ROOT/scripts/prepare-mcp-sidecar.sh" --release
(cd "$ROOT" && pnpm --dir ui build)
