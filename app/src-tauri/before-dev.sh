#!/usr/bin/env bash
# Tauri beforeDevCommand 钩子:确保 debug mcp 与 app 同目录(target/debug),再起 Vite。
# 一键接入在 tauri dev 下也能自动解析到二进制,无需手填。
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 增量编译:已是最新则几乎瞬时。
bash "$ROOT/scripts/prepare-mcp-sidecar.sh"
(cd "$ROOT" && pnpm --dir ui dev)
