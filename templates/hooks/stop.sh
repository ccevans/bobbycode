#!/usr/bin/env bash
# hooks/stop.sh
#
# Claude Code Stop hook — fires before Claude Code stops responding.
# Every SAVE_INTERVAL human turns, prompts the agent to check if it
# discovered any new patterns worth recording before the session ends.
#
# Configured in .claude/settings.json:
#   "Stop": [{"matcher": "", "hooks": [{"type": "command", "command": "hooks/stop.sh"}]}]

SAVE_INTERVAL="${BOBBY_SAVE_INTERVAL:-20}"
STATE_DIR="${HOME}/.bobby/hook-state"
mkdir -p "$STATE_DIR"

input=$(cat)

# If already triggered (second stop attempt), let through — prevents infinite loop
stop_hook_active=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(str(d.get('stop_hook_active', False)))
except Exception:
    print('False')
")

if [ "$stop_hook_active" = "True" ]; then
    echo "{}"
    exit 0
fi

# Get transcript path and session ID
transcript_path=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('transcript_path', ''))
except Exception:
    print('')
")

session_id=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('session_id', 'unknown'))
except Exception:
    print('unknown')
")

# If no transcript, let through
if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
    echo "{}"
    exit 0
fi

# Count human turns in the transcript
human_count=$(python3 -c "
import json
count = 0
try:
    with open('$transcript_path') as f:
        for line in f:
            try:
                d = json.loads(line.strip())
                if d.get('type') == 'human':
                    count += 1
            except Exception:
                pass
except Exception:
    pass
print(count)
" 2>/dev/null)

# Read last save count for this session
state_file="$STATE_DIR/${session_id}.last_save"
last_save=0
if [ -f "$state_file" ]; then
    last_save=$(cat "$state_file")
fi

turns_since_save=$((human_count - last_save))

if [ "$turns_since_save" -ge "$SAVE_INTERVAL" ] 2>/dev/null; then
    # Update state so next stop check resets the counter
    echo "$human_count" > "$state_file"

    reason="Before stopping, reflect on this session: did you encounter any new anti-patterns, gotchas, or validated approaches worth recording?

If yes, record them now:
  bobby learn <agent-name> \"<slug>\" \"<description>\"

Check that the slug doesn't already exist in the learnings file before adding.

If nothing noteworthy happened this session, you may stop."

    python3 -c "import json; print(json.dumps({'decision': 'block', 'reason': '$reason'}))"
else
    echo "{}"
fi
