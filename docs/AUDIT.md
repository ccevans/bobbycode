# Bobby Full Audit — 2026-07-19

> **Historical snapshot.** This records the audit as run on 2026-07-19; most
> findings have since been addressed. Two things it references were renamed
> afterward: **"pipeline" → "workflow"** throughout the user-facing surface, and
> the files `lib/pipeline.js` → `lib/workflow.js`, `commands/pipeline.js` →
> `commands/workflow.js`, `templates/skills/bobby-pipeline/` →
> `bobby-workflow/`. Finding **C4** (the word "pipeline" being overloaded) is
> what motivated that rename. The finding text below is left as-written to
> preserve the record.

Four-dimension audit (CLI surface, onboarding/config, docs accuracy, skills/concepts)
run against the question: **how simple can Bobby be for a solo founder who only uses
the tool?** Verdicts: `FIX` (bug), `BUILD` (simplification work), `MERGE`, `HIDE`,
`KILL`, `KEEP`, `DEFER`.

---

## A. Bugs (fix regardless of simplification)

| # | Verdict | Finding | Where |
|---|---------|---------|-------|
| A1 | FIX | **`ticket attach` deletes the source file.** Says "attach", does copy + `unlinkSync` — a founder attaching an original screenshot loses it. Copy by default; add `--move`. | commands/attach.js:37-38 |
| A2 | FIX | **Custom pipelines can't end in `ship`.** `VALID_STEPS` omits `ship` (the most-chained agent, 13 template refs) and includes `strategy` mapped to stage `backlog`, which is meaningless as a pipeline step. | commands/pipeline.js:5-10, lib/pipeline.js:13-16 |
| A3 | FIX | **`retro` hard-codes `.claude/skills`** while `learn` correctly resolves `target.paths().skills` — retro reads the wrong dir for the Cline target. | commands/retro.js:109,175 |
| A4 | FIX | **`retro <id>` declared optional-args but requires both at runtime** — help advertises `[id] [pattern]`, body errors without both. | commands/retro.js:240,264-266 |
| A5 | FIX | **`-p` collision:** priority everywhere (`create`, `update`, `list`, `idea promote`) except `dashboard` where it's port. Drop `-p` from dashboard (keep `--port`). | commands/dashboard.js:34 |
| A6 | FIX | **`-a` collision:** `--author` on create, `--assigned` on update. Pick one meaning per short flag (drop `-a` from one). | commands/create.js:15, commands/update.js:13 |
| A7 | KILL | **Dead config keys:** `idea_prefix` (never read), `skill_routing` (in DEFAULTS + every stack JSON + commented block; zero readers), `auto_merge`, `dashboard.sandbox`. Remove from DEFAULTS, stacks, and commented output. | lib/config.js:12,18,31; stacks/*.json |
| A8 | KILL | **36 KB of orphaned reference docs** scaffolded into every project: `bobby-ux/references/{audit_website,ui_ux_pro_max,brainstorming}.md` are referenced by nothing (SKILL only uses brand_guidelines + frontend_design). | templates/skills/bobby-ux/references/ |
| A9 | FIX | **ROADMAP lists shipped work as "Later":** "Multi-project awareness" duplicates the shipped studio/`brief --all`. | docs/ROADMAP.md:26 |
| A10 | FIX | **Alias inconsistency:** `idea rm`(alias remove) vs `sprint remove`(alias rm) vs `pipeline remove`(alias rm); `ls` alias missing on exactly the two most-used lists (`ticket list`, `session list`). Standardize: primary `rm`/`list`, alias `remove`/`ls`, everywhere. | idea.js:130, sprint.js:166, pipeline.js:88, list.js:119, session.js:76 |

## B. Founder simplification (the build plan, confirmed by audit data)

| # | Verdict | Item | Evidence from audit |
|---|---------|------|---------------------|
| B1 | BUILD | **`bobby go`** — no-arg runs the computed next action; `go "text"` creates + runs; `go TKT-n` runs that ticket. | `nextAction` logic already exists (lib/brief.js); create→run is today a 2-command, 3-concept path |
| B2 | BUILD | **Progressive help.** Human-only, zero-template-ref commands (`session`, `sync`, `pipeline`, `export`, `learn`, `retro`, `projects`) hide behind `bobby help --all`. Visible: `go`, `idea`, `brief`, `ticket`, `sprint`, `run`, `dashboard`, `init`, `upgrade`. | CLI audit: template-reference counts show which commands only agents/power-users touch |
| B3 | BUILD | **Zero-question init.** Happy path currently 5–9 prompts. New default: detect everything (name from dir/package.json, stack detection already exists, target=claude-code, quick mode, auto-commit) → 0 prompts; `--custom` keeps the wizard. Git-identity fix prompts stay (they prevent real breakage). | Onboarding audit: prompt-by-prompt map; detection already computes every default |
| B4 | BUILD | **README leads with 3 verbs** (idea/go/brief); tables move down. | Docs audit: content accurate, ordering is expert-first |
| B5 | KEEP | Sprints, dashboard, pipelines, retro/learn — power surface stays; it's what agents run on. Simplicity = who must *know* about it, not deletion. | 290+ agent refs; learn/retro loop feeds agent quality |

## C. Overlaps noted (deliberate decisions, not bugs)

| # | Verdict | Item | Notes |
|---|---------|------|-------|
| C1 | KEEP (hide) | `projects` ≈ `brief --all` — both enumerate the studio. Keep both (counts vs actions), hide `projects` in default help. | commands/projects.js vs brief.js |
| C2 | DEFER | Three near-duplicate orchestration prompt builders (`buildOrchestrationPrompt` / `buildFeaturePrompt` / `buildSprintPrompt`) share ~70% of their text. Consolidate into one parameterized builder — worthwhile refactor, not founder-facing. | lib/pipeline.js:93,497,645 |
| C3 | DEFER | `retro --weekly` re-implements `sessionSummary` aggregation. Refactor retro to consume lib/session.js. | commands/retro.js:13-70 vs lib/session.js:114 |
| C4 | KEEP | "pipeline" means 3 things (manage / built-in agent / custom name). Progressive help hides the management surface; agent docs already disambiguate. Revisit if confusion persists. | pipeline.js, run.js:49-52 |
| C5 | KEEP | `move done` can bypass `shipping`. Legitimate for docs-only tickets; leave. | stages.js:22 |
| C6 | DEFER | Outside-a-project behavior inconsistent (most commands error; `idea`/`brief` fall back to studio). Acceptable — the fallbacks are the point — but error text for the rest should suggest `bobby init`. Already does. | config.js:290 |

## D. Loop-closure status (context for roadmap)

- session → retro: **automated** (retro parses session JSONL).
- learn → agents: **automated** (15/17 agents load learnings at startup).
- retro → learn: **manual** — nothing promotes retro findings into learnings.
  Already on ROADMAP ("Retro that feeds forward"). Unchanged by this audit.

## Sequencing

1. **Wave 1 — bugs (A1–A10):** small, safe, independently testable.
2. **Wave 2 — simplification (B1–B4):** go → help → init → README.
3. **Wave 3 — deferred refactors (C2, C3):** code health, no user-facing change.
