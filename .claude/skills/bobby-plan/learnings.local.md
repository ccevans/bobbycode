# Plan — This Project's Learnings

**This file is yours.** Bobby seeds it once and never writes it again — not on
re-scaffold, not on upgrade. `bobby learn bobby-plan "pattern" "description"` adds here.

Shipped anti-patterns live in `learnings.md` and are refreshed on upgrade.
Anything you write there will be lost; write it here instead. Where the two
disagree, **this file wins**.

## Anti-Patterns
<!-- bobby learn bobby-plan "pattern" "description" to add entries -->

- **single-repo-to-multi-repo-not-blanket-rethread**: When making a single-`this.repoRoot` orchestrator multi-repo, do NOT blanket-replace every this.repoRoot with the resolved ws.repoRoot. Three sites must STAY this.repoRoot: repo runs (no ticket, main checkout by design), the hasProduct/board path (product+tickets live at the STUDIO root, not the code repo), and the repo-run diff/changedFiles branches. Only the per-workspace git ops (worktree create, merge, removeWorktree, diffAgainstMain, changedFiles, main-checkout lock) become ws.repoRoot. And every consumer needs a '|| this.repoRoot' fallback because WorkspaceStore persists to JSON — records written before the field existed have no ws.repoRoot.

- **merge-shared-map-not-keep-both**: When planning a branch merge, conflicts on the SAME data structure (STAGE_MAP, STAGE_ORDER, stage-rank objects, count-assertions) are NOT 'keep both' — both blocks redeclare one const. Resolution is a semantic union of entries into one object, and any test asserting a length/count must be RECOMPUTED from the merged reality (e.g. STAGES became 18 when studio said 17 and app said 13), never copied from either side.
