#!/usr/bin/env bash
# hooks/postcompact-restore.sh
#
# Claude Code SessionStart hook, matcher "compact". After a compaction, hands
# the agent its ticket's progress.md so it resumes instead of re-deriving.
# Plain stdout from a SessionStart hook is added to the agent's context.
#
# Which ticket: the one whose id appears in the current git branch (parallel
# sessions each have their own worktree and branch); otherwise nothing. No
# guessing at "the newest checkpoint" — another session's would be worse than none.
cat >/dev/null

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
BRANCH="$(git branch --show-current 2>/dev/null)"

python3 - "$ROOT" "$BRANCH" <<'PY'
import os, re, sys, glob

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
            print(f"Context was just compacted. You are working on {ident.upper()} on branch '{branch}'.")
            print(f"Your last checkpoint ({progress}) follows. Resume from its 'Remaining' and 'Next action'; re-read ticket.md and plan.md only if you need to.\n")
            print(open(progress).read())
        sys.exit(0)
PY
exit 0
