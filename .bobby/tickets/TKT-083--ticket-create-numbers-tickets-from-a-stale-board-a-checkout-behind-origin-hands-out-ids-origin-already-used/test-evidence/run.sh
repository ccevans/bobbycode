set -u
B="node /Users/ccevans/Repos/bobby/worktrees/tkt-083/bin/bobby.js"
S=$(pwd); rm -rf fx; mkdir fx; cd fx
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
git init -q --bare -b main origin.git
git clone -q origin.git seed 2>/dev/null; cd seed
printf 'ticket_prefix: TKT\n' > .bobbyrc.yml; mkdir -p .bobby/tickets src; echo 0 > .bobby/tickets/.counter; echo x> src/index.js
git add -A; git commit -qm init; git push -q origin main; cd ..
git clone -q origin.git M4; git clone -q origin.git Intel
for d in M4 Intel; do git -C $d config user.name t; git -C $d config user.email t@t; done
echo "=== TC1 setup: Intel creates+pushes"
cd Intel; $B ticket create -t "From Intel" ; git add -A; git commit -qm "intel ticket"; git push -q origin main; cd ..
cd M4
echo "=== TC1 M4 create (not pulled)"; $B ticket create -t "From M4"; echo "exit=$?"; ls .bobby/tickets; cat .bobby/tickets/.counter
echo "=== TC6 go"; $B go "add a page"; echo "exit=$?"; ls .bobby/tickets
echo "=== TC7a brief"; $B brief 2>&1 | head -8; echo "exit=${PIPESTATUS[0]}"
echo "=== follow printed cmd"; git -C $(pwd) pull --rebase origin main 2>&1 | tail -1
echo "=== TC2 create"; $B ticket create -t "From M4"; echo "exit=$?"; ls .bobby/tickets; cat .bobby/tickets/.counter
echo "=== TC7b brief current"; $B brief 2>&1 | grep -i behind; echo "grep-exit=$? (1 = none)"
