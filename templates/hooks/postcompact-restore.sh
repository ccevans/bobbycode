#!/usr/bin/env bash
# hooks/postcompact-restore.sh
#
# Claude Code SessionStart hook, matcher "compact". After a compaction, hands
# the agent its checkpoint so it resumes instead of re-deriving.
# Plain stdout from a SessionStart hook is added to the agent's context.
#
# Which checkpoint: the progress.md of the ticket whose id appears in the
# current git branch (parallel sessions each have their own worktree and
# branch). Otherwise, the last progress.md or .bobby/handoffs/*.md this session
# wrote itself, read from its own transcript. No guessing at "the newest
# checkpoint" — another session's would be worse than none.
input=$(cat)

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
BRANCH="$(git branch --show-current 2>/dev/null)"

printf '%s' "$input" | python3 -c '
import os, re, sys, glob, json

root, branch = sys.argv[1], sys.argv[2].lower()
project = os.environ.get("BOBBY_PROJECT", "")
if not project:
    try:
        project = open(os.path.join(root, ".bobby", "active-project")).read().strip()
    except OSError:
        project = ""

dirs = []
if project:
    dirs.append(os.path.join(root, ".bobby", project, "tickets"))
dirs.append(os.path.join(root, ".bobby", "tickets"))

for d in dirs:
    for folder in sorted(glob.glob(os.path.join(d, "*", "")), key=os.path.getmtime, reverse=True):
        ident = os.path.basename(folder.rstrip("/")).split("--")[0].lower()   # rf-1234
        if not re.search(r"(?<![a-z0-9])" + re.escape(ident) + r"(?![0-9])", branch):
            continue
        progress = os.path.join(folder, "progress.md")
        if os.path.exists(progress):
            print(f"Context was just compacted. You are working on {ident.upper()} on branch \x27{branch}\x27.")
            print(f"Your last checkpoint ({progress}) follows. Resume from its \x27Remaining\x27 and \x27Next action\x27; re-read ticket.md and plan.md only if you need to.\n")
            print(open(progress).read())
        sys.exit(0)

# No ticket in the branch: the checkpoint this session wrote, if any.
try:
    transcript = json.load(sys.stdin).get("transcript_path") or ""
except Exception:
    transcript = ""
if not os.path.isfile(transcript):
    sys.exit(0)
last = None
for line in open(transcript, errors="ignore"):
    try:
        d = json.loads(line)
    except Exception:
        continue
    if d.get("type") != "assistant":
        continue
    for b in (d.get("message") or {}).get("content") or []:
        if not isinstance(b, dict) or b.get("type") != "tool_use" or b.get("name") not in ("Write", "Edit"):
            continue
        p = (b.get("input") or {}).get("file_path") or ""
        if os.path.basename(p) == "progress.md" or ("/.bobby/handoffs/" in p and p.endswith(".md")):
            last = p
if last and os.path.exists(last):
    print("Context was just compacted. This session last wrote its checkpoint to " + last + ".")
    print("It follows. Resume from its next action; re-read other files only if you need to.\n")
    print(open(last).read())
' "$ROOT" "$BRANCH"
exit 0
