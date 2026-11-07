#!/usr/bin/env bash
# hooks/context-cap.sh
#
# UserPromptSubmit hook. Reads the last assistant turn's context size from the
# transcript. Past BOBBY_CONTEXT_CAP tokens (default 250000) it tells the agent
# to write a handoff and stop taking new work.
# Interactive sessions then start their own successor with
# hooks/handoff-spawn.sh; headless runs (-p / SDK) only stop.

CAP="${BOBBY_CONTEXT_CAP:-250000}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
input=$(cat)

printf '%s' "$input" | CAP="$CAP" HOOK_DIR="$HOOK_DIR" python3 -c '
import sys, json, os
cap = int(os.environ["CAP"])
try:
    hook = json.load(sys.stdin)
    path = hook["transcript_path"]
except Exception as e:
    sys.exit("context-cap: no transcript_path in hook input: %s" % e)
last = 0
with open(path, errors="ignore") as f:
    for line in f:
        try:
            d = json.loads(line)
        except Exception:
            continue
        u = (d.get("message") or {}).get("usage") if d.get("type") == "assistant" else None
        if u:
            last = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
if last <= cap:
    sys.exit(0)

size = "CONTEXT CAP: this session is at about %dk tokens (cap %dk). " % (last // 1000, cap // 1000)
marker = os.path.join(os.path.expanduser("~/.bobby/hook-state"), "%s.handoff" % hook.get("session_id", ""))
headless = os.environ.get("CLAUDE_CODE_ENTRYPOINT", "").startswith("sdk")
spawn = os.path.join(os.environ["HOOK_DIR"], "handoff-spawn.sh")

if os.path.exists(marker):
    msg = size + ("This session already handed off to %s. Do not do the new request here. "
                  "Tell the user in one line to send it to that session." % open(marker).read().strip())
elif headless:
    msg = size + ("Do not start new work. Finish the current step, write a handoff "
                  "(progress.md in the ticket folder, or a short note), and tell the user in one line to start a fresh session.")
else:
    msg = size + ("Hand off now, without asking the user:\n"
                  "1. Finish only the step in progress. Do not start the new request.\n"
                  "2. Write the handoff: the ticket folder progress.md if this is ticket work, else "
                  ".bobby/handoffs/<YYYY-MM-DD>-<topic>.md. Include what is done, what remains, the next action, "
                  "decisions waiting on the user, key files, and the user'\''s latest message word for word as the first thing to do.\n"
                  "3. Run: %s <handoff file> (if it says the session has no title, run it again with a short name as the second argument)\n"
                  "4. Tell the user in one line which session took over (the script prints its name), then stop." % spawn)
print(json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": msg}}))
'
