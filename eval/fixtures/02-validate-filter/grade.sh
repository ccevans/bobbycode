#!/usr/bin/env bash
# Objective grader for fixture 02. Usage: grade.sh <app-dir> <port>
APP="$1"; PORT="${2:-4802}"; cd "$APP" || exit 2
P=0; F=0
chk(){ if eval "$2"; then echo "    ok: $1"; P=$((P+1)); else echo "    FAIL: $1"; F=$((F+1)); fi; }
J(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
B(){ curl -s "$@"; }

echo "  [regression] existing test suite still green"
chk "node --test passes" "node --test >/dev/null 2>&1"

PORT=$PORT node server.js >/dev/null 2>&1 & SRV=$!; sleep 1
BASE="http://localhost:$PORT"
curl -s -X POST "$BASE/notes" -d '{"title":"Groceries"}' >/dev/null
curl -s -X POST "$BASE/notes" -d '{"title":"Work meeting"}' >/dev/null
curl -s -X POST "$BASE/notes" -d '{"title":"groceries again"}' >/dev/null

chk "empty title -> 400"                "[ \"\$(J -X POST $BASE/notes -d '{\"title\":\"\"}')\" = 400 ]"
chk "whitespace title -> 400"           "[ \"\$(J -X POST $BASE/notes -d '{\"title\":\"   \"}')\" = 400 ]"
chk "missing title -> 400"              "[ \"\$(J -X POST $BASE/notes -d '{}')\" = 400 ]"
chk "400 has correct error message"     "B -X POST $BASE/notes -d '{}' | grep -q 'title is required'"
chk "invalid POST did NOT create"       "[ \"\$(B $BASE/notes | grep -o '\"id\"' | wc -l | tr -d ' ')\" = 3 ]"
chk "valid POST still 201"              "[ \"\$(J -X POST $BASE/notes -d '{\"title\":\"ok\"}')\" = 201 ]"
chk "q filters case-insensitively"      "[ \"\$(B \"$BASE/notes?q=grocer\" | grep -o '\"id\"' | wc -l | tr -d ' ')\" = 2 ]"
chk "q no-match -> [] 200"              "[ \"\$(B \"$BASE/notes?q=zzz\")\" = '[]' ] && [ \"\$(J \"$BASE/notes?q=zzz\")\" = 200 ]"
chk "no q -> all notes"                 "[ \"\$(B $BASE/notes | grep -o '\"id\"' | wc -l | tr -d ' ')\" -ge 4 ]"
kill $SRV 2>/dev/null

echo "  RESULT: $P ok, $F failed"
[ $F -eq 0 ]
