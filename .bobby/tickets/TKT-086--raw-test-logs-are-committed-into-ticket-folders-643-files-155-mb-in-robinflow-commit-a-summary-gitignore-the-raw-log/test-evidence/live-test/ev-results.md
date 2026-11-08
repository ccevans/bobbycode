# TKT-086 live test (branch CLI e2ed603), fixtures in scratchpad
TC1 PASS: rspec.log copied byte-identical (cmp), original kept, summary has Command, Result (Finished in 4.2s/120 examples, 2 failures/EXITCODE=1), 2 rspec ./spec lines, last 100 lines exactly (diff vs tail -n 100 empty).
TC2 PASS: git status shows ?? logs/ ; check-ignore raw=0 (ignored), .log.md=1 (not ignored).
TC3 PASS (live): jest.log ANSI stripped; Result has Test Suites:/Tests: lines; Failures has FAIL + bullet line.
TC4/5 PASS: out.txt -> logs/out.txt.log(.md); ``` inside ~~~~ fence intact.
TC6 PASS: with pattern removed: "rspec.log is not gitignored - run bobby init --refresh", exit 0.
TC7 PASS: attach w/o --log -> test-evidence/screenshots/s.png, no regression.
--move: external file removed + raw+summary written; in-place (logs/mv.log), ../ path, and different-case (LOGS/mv.log on case-insensitive APFS) all keep the file (sha1 unchanged) rc=0.
TC8-10 PASS: init writes pattern; init --refresh x2 adds once ("Added ticket-log ignore pattern"), no-trailing-newline file gets newline; studio init x2 count 1.
TC11 PASS: dry-run lists 2, index unchanged; real: "Untracked 2 log files", D staged, files on disk, notes.md/src/app.log untouched, commits 2->2, .gitignore has pattern; rerun "No tracked ticket logs".
TC12 PASS: studio w/o active project, both projects' logs untracked.
TC13 PASS: non-git -> "Error: untrack-logs needs a git repo" rc=1.
TC14 PASS: scaffolded bobby-test and bobby-ship SKILL.md contain attach --log; ship gate 3 mentions .log.md.
Robinflow studio dry-run (read-only; git status md5 and tracked-log count 759 identical before/after): 759 logs total = robinflow 643, listrobin 58, bobby 53, sam 5. --project robinflow / BOBBY_PROJECT are ignored (studio-wide by design per TC12).
Observations (non-blocking): summary embeds absolute Source: path of the local machine; success line says "raw logs gitignored" even after the not-gitignored warning; `studio init` on an existing studio does not re-add a removed pattern (init --refresh does).
