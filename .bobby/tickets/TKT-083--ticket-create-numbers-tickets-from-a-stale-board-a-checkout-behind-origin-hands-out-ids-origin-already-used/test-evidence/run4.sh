bb(){ node /Users/ccevans/Repos/bobby/worktrees/tkt-083/bin/bobby.js "$@"; }
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
rm -rf dl; mkdir dl; cd dl
git init -q --bare -b main o.git
git clone -q o.git seed 2>/dev/null; cd seed
printf 'ticket_prefix: TKT\n' > .bobbyrc.yml; mkdir -p .bobby/tickets; echo 0 > .bobby/tickets/.counter
git add -A; git commit -qm i; git push -q origin main; cd ..
git clone -q o.git M4; git clone -q o.git Intel
cd M4; git checkout -qb feat; git push -q -u origin feat; cd ..
cd Intel; git fetch -q; git checkout -qb feat origin/feat; bb ticket create -t a >/dev/null; bb ticket create -t b >/dev/null; git add -A; git commit -qm tk; git push -q origin feat
git checkout -q main; git merge -q feat; git push -q origin main; cd ..
cd M4; git fetch -q   # M4 now has origin/feat with tickets
echo "tracking ref tickets:"; git ls-tree -r --name-only origin/feat | grep ticket.md
git -C ../o.git branch -D feat   # branch deleted on origin after merge
echo "== create (expect refuse)"; bb ticket create -t "after delete"; echo "exit=$?"; ls .bobby/tickets
echo "tracking ref still present:"; git rev-parse --verify -q refs/remotes/origin/feat
echo "== RECOVERY literal"; git branch -u origin/main && git pull --rebase; echo "recovery exit=$?"
echo "== create"; bb ticket create -t "after recovery"; echo "exit=$?"; ls .bobby/tickets; echo "origin/main tickets:"; git ls-tree -r --name-only origin/main | grep ticket.md
echo "origin/feat ref still:"; git rev-parse --verify -q refs/remotes/origin/feat; git branch -vv | head -3
