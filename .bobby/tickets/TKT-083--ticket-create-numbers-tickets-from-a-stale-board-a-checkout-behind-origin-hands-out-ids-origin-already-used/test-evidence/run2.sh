set -u
B="node /Users/ccevans/Repos/bobby/worktrees/tkt-083/bin/bobby.js"
cd fx
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
echo "=== TC9 code-only upstream commit"
cd Intel; git pull -q --rebase origin main; echo y>>src/index.js; git commit -qam code; git push -q origin main; cd ..
cd M4; $B ticket create -t "Code only ok"; echo "exit=$?"; $B brief 2>&1 | grep -i behind; echo "brief-behind-grep=$?"
git add -A; git commit -qm m4; git pull -q --rebase origin main; git push -q origin main; cd ..
echo "=== TC3-ish: origin highest ID above M4 counter/disk (floor) - Intel creates TKT-010 manually-pushed via folder"
cd Intel; git pull -q --rebase origin main; mkdir -p .bobby/tickets/TKT-010--big; printf -- '---\nid: TKT-010\ntitle: big\nstage: backlog\n---\n' > .bobby/tickets/TKT-010--big/ticket.md; git add -A; git commit -qm big; git push -q origin main; cd ..
cd M4; git fetch -q; echo "counter=$(cat .bobby/tickets/.counter)"; $B ticket create -t "x" ; echo "exit=$?"; git pull -q --rebase origin main; $B ticket create -t "Above"; echo "exit=$?"; ls .bobby/tickets; cat .bobby/tickets/.counter; echo
git add -A; git commit -qm above; git push -q origin main; cd ..
echo "=== TC4 fetch failure"
cd M4; git remote set-url origin /does/not/exist.git; before=$(ls .bobby/tickets|wc -l); $B ticket create -t Offline; echo "exit=$?"; echo "dirs before=$before after=$(ls .bobby/tickets|wc -l)"
echo "--- brief"; $B brief 2>&1 | head -6; echo "exit=${PIPESTATUS[0]}"
git remote set-url origin ../origin.git; cd ..
echo "=== TC11 never-pushed branch w/ upstream config"
cd M4; git checkout -qb feat; git config branch.feat.remote origin; git config branch.feat.merge refs/heads/feat; $B ticket create -t w; echo "exit=$?"; git add -A; git commit -qm w; git checkout -q main; cd ..
echo "=== TC5 no remote git + non-git"
rm -rf nr ng; mkdir nr ng; (cd nr; git init -q -b main; printf 'ticket_prefix: TKT\n'>.bobbyrc.yml; git add -A; git commit -qm i; $B ticket create -t Local; echo "exit=$?")
(cd ng; printf 'ticket_prefix: TKT\n'>.bobbyrc.yml; $B ticket create -t Local; echo "exit=$?")
