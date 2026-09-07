#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Summon
# @raycast.mode silent
# @raycast.icon ../assets/summon.png
# @raycast.packageName Summon
# @raycast.description Open the latest local Summon code with your saved settings

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
summon_repo="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"

if ! command -v node >/dev/null 2>&1; then
  echo "Summon needs Node.js installed locally."
  exit 1
fi

# launchd runs this branch independently of Raycast and its terminal environment.
if [[ "${1:-}" == "--run" ]]; then
  unset ELECTRON_RUN_AS_NODE NODE_OPTIONS
  export DEBUG=1 SUMMON_LAUNCHER=1
  export WITSY_HOME="$HOME/Library/Application Support/Summon"
  cd -- "$summon_repo"
  exec node "$summon_repo/node_modules/@electron-forge/cli/dist/electron-forge.js" start
fi

exec node "$summon_repo/tools/launch-summon.mjs"
