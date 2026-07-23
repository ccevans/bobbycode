#!/usr/bin/env bash
# Objective grader for fixture 01. Usage: grade.sh <app-dir> <port>
# Exits 0 (PASS) only if every check holds. Behavior-based (curls the live app).
APP="$1"; PORT="${2:-4801}"; cd "$APP" || exit 2
P=0; F=0
chk(){ if eval "$2"; then echo "    ok: $1"; P=$((P+1)); else echo "    FAIL: $1"; F=$((F+1)); fi; }
J(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }        # http code
B(){ curl -s "$@"; }                                        # body

echo "  [regression] existing test suite still green"
chk "node --test passes" "node --test >/dev/null 2>&1"

PORT=$PORT node server.js >/dev/null 2>&1 & SRV=$!; sleep 1
BASE="http://localhost:$PORT"
curl -s -X POST "$BASE/notes" -d '{"title":"keep"}' >/dev/null
curl -s -X POST "$BASE/notes" -d '{"title":"del"}'  >/dev/null   # id 2

chk "DELETE existing -> 204"           "[ \"\$(J -X DELETE $BASE/notes/2)\" = 204 ]"
chk "deleted note now 404 on GET"      "[ \"\$(J $BASE/notes/2)\" = 404 ]"
chk "deleted note gone from list"      "! B $BASE/notes | grep -q '\"del\"'"
chk "surviving note still present"     "B $BASE/notes | grep -q '\"keep\"'"
chk "DELETE missing -> 404"            "[ \"\$(J -X DELETE $BASE/notes/999)\" = 404 ]"
chk "DELETE missing -> error body"     "B -X DELETE $BASE/notes/999 | grep -q 'not found'"
chk "POST still works (201)"           "[ \"\$(J -X POST $BASE/notes -d '{\"title\":\"x\"}')\" = 201 ]"
kill $SRV 2>/dev/null

echo "  RESULT: $P ok, $F failed"
[ $F -eq 0 ]
