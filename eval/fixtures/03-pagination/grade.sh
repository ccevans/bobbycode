#!/usr/bin/env bash
# Objective grader for fixture 03. Usage: grade.sh <app-dir> <port>
APP="$1"; PORT="${2:-4803}"; cd "$APP" || exit 2
P=0; F=0
chk(){ if eval "$2"; then echo "    ok: $1"; P=$((P+1)); else echo "    FAIL: $1"; F=$((F+1)); fi; }
B(){ curl -s "$@"; }
J(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
count(){ B "$1" | grep -o '"id"' | wc -l | tr -d ' '; }    # number of notes in the JSON array

echo "  [regression] existing test suite still green"
chk "node --test passes" "node --test >/dev/null 2>&1"

PORT=$PORT node server.js >/dev/null 2>&1 & SRV=$!; sleep 1
BASE="http://localhost:$PORT"
for i in $(seq 1 25); do curl -s -X POST "$BASE/notes" -d "{\"title\":\"n$i\"}" >/dev/null; done

chk "default limit 20 (25 notes -> 20)"   "[ \"\$(count $BASE/notes)\" = 20 ]"
chk "limit=5 -> 5"                        "[ \"\$(count \"$BASE/notes?limit=5\")\" = 5 ]"
chk "offset=20 -> remaining 5"            "[ \"\$(count \"$BASE/notes?offset=20\")\" = 5 ]"
chk "limit capped at 100 (25 -> 25)"      "[ \"\$(count \"$BASE/notes?limit=1000\")\" = 25 ]"
chk "offset out of range -> [] "         "[ \"\$(B \"$BASE/notes?offset=999\")\" = '[]' ]"
chk "limit=abc doesn't crash (200)"      "[ \"\$(J \"$BASE/notes?limit=abc\")\" = 200 ]"
chk "limit=-5 doesn't crash (200)"       "[ \"\$(J \"$BASE/notes?limit=-5\")\" = 200 ]"
chk "offset=-1 doesn't crash (200)"      "[ \"\$(J \"$BASE/notes?offset=-1\")\" = 200 ]"
chk "server still alive after hostile"   "[ \"\$(J $BASE/notes)\" = 200 ]"
kill $SRV 2>/dev/null

echo "  RESULT: $P ok, $F failed"
[ $F -eq 0 ]
