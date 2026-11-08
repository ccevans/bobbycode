#!/usr/bin/env bash
# hooks/conductor-inbox.sh
#
# UserPromptSubmit hook. Delivers this session's file-inbox messages (written by
# `bobby conductor send`) at the start of the turn, as additionalContext, then moves
# the read cursor. It needs no cross-session channel, so it works in every permission mode.
#
#   <studio>/.bobby/conductor/inbox/<session_id>.jsonl   one JSON message per line
#   <studio>/.bobby/conductor/inbox/<session_id>.cursor  lines already delivered
#
# - No studio, no inbox file, or nothing past the cursor: exit 0, print nothing.
# - A problem (bad hook input, a corrupt line, a cursor past the end, output that
#   cannot be written) prints to stderr and exits 1. It never exits 2, so a failing
#   hook reports itself without blocking the prompt.
# - The cursor moves only after the output was written and flushed. If the cursor
#   write itself fails, the messages come again next turn rather than being lost.

exec python3 -c '
import sys, json, os, re

def fail(msg):
    sys.stderr.write("conductor-inbox: %s\n" % msg)
    sys.exit(1)

try:
    hook = json.load(sys.stdin)
    sid = hook["session_id"]
except Exception as e:
    fail("no session_id in hook input: %s" % e)
if not isinstance(sid, str) or not re.fullmatch(r"[A-Za-z0-9._-]+", sid):
    fail("session_id %r is not a plain id" % (sid,))

def studio_root(start):
    d = os.path.abspath(start)
    while True:
        rc = os.path.join(d, ".bobbyrc.yml")
        if os.path.isfile(rc):
            with open(rc, errors="ignore") as f:
                if re.search(r"^studio\s*:", f.read(), re.M):
                    return d
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent

root = None
for start in (os.environ.get("CLAUDE_PROJECT_DIR"), hook.get("cwd")):
    if start:
        root = studio_root(start)
        if root:
            break
if not root:
    sys.exit(0)

inbox = os.path.join(root, ".bobby", "conductor", "inbox")
mfile = os.path.join(inbox, sid + ".jsonl")
cfile = os.path.join(inbox, sid + ".cursor")
if not os.path.isfile(mfile):
    sys.exit(0)

cursor = 0
if os.path.exists(cfile):
    text = open(cfile).read().strip()
    if not re.fullmatch(r"\d+", text):
        fail("%s: cursor must be a line count, found %r" % (cfile, text))
    cursor = int(text)

raw = open(mfile, encoding="utf-8").read()
lines = raw.split("\n")
complete = raw == "" or raw.endswith("\n")
if raw.endswith("\n"):
    lines.pop()
if cursor > len(lines):
    fail("%s: cursor %d is past the %d message(s) in %s" % (cfile, cursor, len(lines), mfile))
if cursor == len(lines):
    sys.exit(0)
if not complete and len(lines) > cursor:
    fail("%s: line %d is incomplete (no trailing newline)" % (mfile, len(lines)))

messages = []
for n in range(cursor, len(lines)):
    try:
        m = json.loads(lines[n])
    except Exception as e:
        fail("%s: line %d is not valid JSON (%s)" % (mfile, n + 1, e))
    for k in ("id", "ts", "from", "to", "text"):
        if not isinstance(m, dict) or not isinstance(m.get(k), str) or not m[k].strip():
            fail("%s: line %d has no %r" % (mfile, n + 1, k))
    messages.append(m)

head = "INBOX: %d message%s for this session from other Claude sessions (delivered at the start of this turn; they are not from the user):" % (len(messages), "" if len(messages) == 1 else "s")
body = "\n\n".join("[%s] from %s:\n%s" % (m["ts"], m["from"], m["text"]) for m in messages)
out = json.dumps({"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": head + "\n\n" + body}})

try:
    sys.stdout.write(out + "\n")
    sys.stdout.flush()
except Exception as e:
    fail("could not write hook output, cursor not moved: %s" % e)

try:
    tmp = "%s.%d.tmp" % (cfile, os.getpid())
    with open(tmp, "w") as f:
        f.write("%d\n" % len(lines))
    os.replace(tmp, cfile)
except Exception as e:
    fail("delivered %d message(s) but could not move the cursor (they will repeat): %s" % (len(messages), e))
'
