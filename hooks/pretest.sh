#!/usr/bin/env bash
# hooks/pretest.sh
#
# Claude Code SubagentStart hook — fires before bobby-test runs.
# Restarts services defined in the project's local profile so tests
# hit a clean environment. Generated from .bobbyrc.yml local config.
#
# Configured in .claude/settings.json:
#   "SubagentStart": [{"matcher": "bobby-test", "hooks": [{"type": "command", "command": "hooks/pretest.sh"}]}]

set -euo pipefail

# Read and discard stdin (hook protocol)
read -r _input 2>/dev/null || true



# No local profile configured — nothing to restart.
# Add a local profile to .bobbyrc.yml and re-run bobby init to generate restart commands.
echo "pretest: no local profile — skipping service restart"

