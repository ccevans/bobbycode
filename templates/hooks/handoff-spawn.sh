#!/usr/bin/env bash
# hooks/handoff-spawn.sh <handoff-file> [session-name]
#
# Run by a session that hit the context cap (hooks/context-cap.sh tells it to),
# after it wrote its handoff. Starts the successor session in the background
# with Remote Control on, named "<this session's name> 2" (3, 4, ...), same
# model and effort, told to read the handoff. [session-name] is needed only when
# this session has no title in its transcript. Once per session: a second call
# refuses, so the same work never runs in two sessions.

set -euo pipefail
HANDOFF="${1:?usage: hooks/handoff-spawn.sh <handoff-file> [session-name]}"
GIVEN_NAME="${2:-}"
SID="${CLAUDE_CODE_SESSION_ID:?handoff-spawn: CLAUDE_CODE_SESSION_ID not set; run it from the session that is handing off}"
STATE_DIR="${HOME}/.bobby/hook-state"
MARKER="$STATE_DIR/${SID}.handoff"
mkdir -p "$STATE_DIR"

if [ -f "$MARKER" ]; then
  echo "handoff-spawn: this session already handed off: $(cat "$MARKER")" >&2
  exit 1
fi

HANDOFF="$(cd "$(dirname "$HANDOFF")" && pwd)/$(basename "$HANDOFF")"
if [ ! -s "$HANDOFF" ]; then
  echo "handoff-spawn: $HANDOFF is missing or empty; write the handoff first" >&2
  exit 1
fi
if [ -z "$(find "$HANDOFF" -mmin -30)" ]; then
  echo "handoff-spawn: $HANDOFF was not written in the last 30 minutes; update it with this session's state first" >&2
  exit 1
fi

TRANSCRIPT="$(ls "$HOME"/.claude/projects/*/"$SID".jsonl 2>/dev/null | head -1)"
if [ -z "$TRANSCRIPT" ]; then
  echo "handoff-spawn: no transcript found for session $SID" >&2
  exit 1
fi

# name, successor name, model, start dir, from the transcript
read -r -d '' INFO < <(python3 - "$TRANSCRIPT" "$GIVEN_NAME" <<'PY'
import json, re, sys
custom = ai = model = cwd = ""
for line in open(sys.argv[1], errors="ignore"):
    try:
        d = json.loads(line)
    except Exception:
        continue
    t = d.get("type")
    if t == "custom-title" and d.get("customTitle"):
        custom = d["customTitle"]
    elif t == "ai-title" and d.get("aiTitle"):
        ai = d["aiTitle"]
    elif t == "assistant" and (d.get("message") or {}).get("model"):
        model = d["message"]["model"]
    if not cwd and d.get("cwd"):
        cwd = d["cwd"]
name = (sys.argv[2] or custom or ai).strip()
if not name:
    sys.exit("handoff-spawn: this session has no title; run it again with a short name: hooks/handoff-spawn.sh <handoff-file> \"<name>\"")
m = re.match(r"^(.*\S)\s+(\d+)$", name)
nxt = f"{m.group(1)} {int(m.group(2)) + 1}" if m else f"{name} 2"
if not model or model.startswith("<"):
    sys.exit("handoff-spawn: no model found in the transcript")
if not cwd:
    sys.exit("handoff-spawn: no working directory found in the transcript")
print(name); print(nxt); print(model); print(cwd)
PY
) || true
NAME="$(sed -n 1p <<<"$INFO")"; NEXT="$(sed -n 2p <<<"$INFO")"
MODEL="$(sed -n 3p <<<"$INFO")"; CWD="$(sed -n 4p <<<"$INFO")"
if [ -z "$CWD" ]; then
  echo "handoff-spawn: could not read name, model and start dir from $TRANSCRIPT" >&2
  exit 1
fi

EFFORT_ARGS=()
if [ -n "${CLAUDE_EFFORT:-}" ]; then EFFORT_ARGS=(--effort "$CLAUDE_EFFORT"); fi

PROMPT="You are taking over from the session \"$NAME\", which hit the context cap. Read $HANDOFF and continue from its next action. Do not redo finished work. Re-read other files only when the handoff points you at them."

cd "$CWD"
OUT="$(claude --bg --remote-control "$NEXT" -n "$NEXT" --model "$MODEL" ${EFFORT_ARGS[@]+"${EFFORT_ARGS[@]}"} "$PROMPT" 2>&1)"
BG_ID="$(sed -n 's/^backgrounded · \([0-9a-f]*\) · .*/\1/p' <<<"$OUT" | head -1)"
if [ -z "$BG_ID" ]; then
  echo "handoff-spawn: claude --bg did not start a session:" >&2
  echo "$OUT" >&2
  exit 1
fi

echo "\"$NEXT\" (bg $BG_ID, $MODEL) from $HANDOFF" > "$MARKER"
echo "Handed off to \"$NEXT\" (bg $BG_ID, $MODEL). Handoff: $HANDOFF"
