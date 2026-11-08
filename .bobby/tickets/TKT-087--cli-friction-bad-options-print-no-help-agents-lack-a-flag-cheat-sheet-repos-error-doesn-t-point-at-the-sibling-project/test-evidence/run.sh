#!/bin/bash
S=/private/tmp/claude-501/-Users-ccevans-Repos-bobby-code-studio/e0e1e9d3-5d62-43f8-b34c-f913186cdaf2/scratchpad
B="node /Users/ccevans/Repos/bobby/worktrees/tkt-087/bin/bobby.js"
MODE=$1
r(){ local d=$1; shift; echo; echo "\$ [cwd=${d##*/}] ${MODE_LABEL} bobby $*"; (cd $d; if [ "$MODE" = set ]; then export BOBBY_PROJECT=${PROJ:-robinflow}; else unset BOBBY_PROJECT; fi; $B "$@" >$S/o.txt 2>$S/e.txt; echo $? >$S/x.txt); echo "--stdout:"; head -${LINES_MAX:-12} $S/o.txt; echo "--stderr:"; head -${LINES_MAX:-12} $S/e.txt; echo "[exit $(cat $S/x.txt)]"; }
echo "##### MODE=$MODE (BOBBY_PROJECT $([ $MODE = set ] && echo =robinflow || echo unset))"
P=$S/plain; ST=$S/studio
echo "== TC1/2/3 plain project"
LINES_MAX=4 r $P ticket create --bogus -t x; ls $P/.bobby/tickets | grep -c '^TKT-' 
LINES_MAX=4 r $P brief --bogus
LINES_MAX=4 r $P ticket move TKT-001
LINES_MAX=4 r $ST project use
LINES_MAX=3 r $P ticket create --help; LINES_MAX=3 r $P
LINES_MAX=4 r $P "add a health check"
echo "== studio TC7-11"
PA="--project robinflow"; [ $MODE = set ] && PA=""
LINES_MAX=6 r $ST $PA ticket create -t "ops job" --repos robin-ops; ls $ST/.bobby/robinflow/tickets | grep -c '^RF-'
LINES_MAX=6 r $ST $PA ticket create -t x --repos nope
LINES_MAX=6 r $ST $PA ticket create -t x --repos robin-ops,nope
LINES_MAX=6 r $ST $PA ticket create -t ok --repos app; grep -h '^repos' $ST/.bobby/robinflow/tickets/RF-*/ticket.md
PO=""; [ $MODE = unset ] && PO="--project robin-ops"
PROJ=robin-ops LINES_MAX=6 r $ST $PO ticket create -t "ops job"; ls $ST/.bobby/robin-ops/tickets | grep RO-
