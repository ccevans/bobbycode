#!/usr/bin/env bash
# hooks/precompact.sh
#
# Claude Code PreCompact hook — fires before context compression.
# Forces the active Bobby agent to write a progress checkpoint so it
# can resume after compaction without losing its place.
#
# Configured in .claude/settings.json:
#   "PreCompact": [{"matcher": "", "hooks": [{"type": "command", "command": "hooks/precompact.sh"}]}]

read -r input

printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}

# Always block to prompt the agent to checkpoint before compaction
reason = (
    'Context is about to be compressed. '
    'If you are mid-task on a Bobby ticket (building, reviewing, or debugging), '
    'write a progress checkpoint to the ticket folder: '
    '.bobby/tickets/{ID}*/progress.md\n\n'
    'Include in progress.md:\n'
    '- Current stage and step number (e.g. \"Building: step 3 of 6\")\n'
    '- Branch name\n'
    '- Files changed so far (with status: done / in-progress / untouched)\n'
    '- Tests currently passing\n'
    '- Tests currently failing (with reason)\n'
    '- Exact next action\n'
    '- Any blockers\n\n'
    'If you are NOT mid-task on a ticket, reply: \"No active ticket — compaction safe.\" '
    'and I will allow compaction to proceed.'
)

print(json.dumps({'decision': 'block', 'reason': reason}))
"
