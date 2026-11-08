bb(){ node /Users/ccevans/Repos/bobby/worktrees/tkt-083/bin/bobby.js "$@"; }
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
rm -rf st; mkdir st; cd st
git init -q --bare -b main o.git
git clone -q o.git seed 2>/dev/null; cd seed
echo 'studio: s' > .bobbyrc.yml
for p in app:AP other:OT; do n=${p%%:*}; x=${p##*:}; mkdir -p .bobby/$n/tickets; printf 'project: %s\nprefix: %s\n' $n $x > .bobby/$n/.bobbyrc.yml; echo 0 > .bobby/$n/tickets/.counter; done
mkdir src; echo a>src/a; git add -A; git commit -qm i; git push -q origin main; cd ..
git clone -q o.git A; git clone -q o.git B
echo "== TC8a"; (cd B; bb ticket create -t first --project app; git add -A; git commit -qm b; git push -q origin main)
cd A; bb ticket create -t x --project app; echo "exit=$?"; ls .bobby/app/tickets
git pull -q --rebase origin main
echo "== TC8b"
(cd ../B; bb ticket create -t o --project other >/dev/null; git add -A; git commit -qm o; git push -q origin main)
git fetch -q; git status -sb | head -1
bb ticket create -t y --project app; echo "exit=$?"
