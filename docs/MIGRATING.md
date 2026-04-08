# Migrating to Bobby

Bobby works with any project. This guide covers common migration scenarios.

## I already use Claude Code with CLAUDE.md

Bobby uses `<!-- bobby:start -->` / `<!-- bobby:end -->` markers to manage its own section within your CLAUDE.md. Your existing content is preserved.

**What happens on `bobby init`:**

- If no CLAUDE.md exists, Bobby creates one with its workflow section wrapped in markers.
- If CLAUDE.md exists with your own content, Bobby **appends** its section at the end (wrapped in markers) and backs up the original to `CLAUDE.md.pre-bobby`.
- On re-scaffold (`bobby init` again), Bobby updates **only** the content between its markers — your content outside the markers is untouched.

You can move the Bobby section anywhere in the file (top, middle, bottom). Bobby finds and updates it by markers.

If you want Bobby to fully own CLAUDE.md, delete your content outside the markers. Or move project-specific rules into a custom skill (see [CUSTOMIZING.md](CUSTOMIZING.md)).

## I already have .claude/skills/

Bobby prefixes all its skills with `bobby-` (e.g., `bobby-build`, `bobby-review`). Your existing skills will not be overwritten.

During `bobby init` (full mode), Bobby detects non-bobby skills and offers to register them as `build_skills`, so the build agent follows your project conventions.

If you run quick mode, you can add them manually later:

```yaml
# .bobbyrc.yml
build_skills:
  - api-patterns
  - component-library
```

## I just want tickets, not the full pipeline

Run `bobby init` — everything scaffolds, but you only use what you need:

```bash
bobby create -t "Fix login bug" -p high      # Create tickets
bobby create -t "User dashboard" --epic       # Create epics
bobby list                                    # See your board
bobby move TKT-001 build                     # Move tickets manually
bobby comment TKT-001 "Found the root cause" # Add notes
```

Ignore `bobby run pipeline` entirely. The agents are there when you're ready for them.

## I just want the pipeline on existing work

If you have work in progress that you want to run through Bobby's pipeline:

```bash
# Create tickets for existing work
bobby create -t "Refactor auth middleware"

# Set the stage to wherever you are
bobby move TKT-001 build    # Already planned, ready to build
bobby move TKT-002 review   # Already built, needs review

# Pick up from the current stage
bobby run next TKT-001      # Runs bobby-build (next stage after building)
bobby run next TKT-002      # Runs bobby-review
```

## Incremental adoption path

A recommended progression for teams trying Bobby for the first time:

**Week 1: Ticket tracking only**
- `bobby create` and `bobby list` for task management
- `bobby move` to manually track progress
- Get comfortable with the ticket lifecycle

**Week 2: Try a single agent**
- Pick one ticket and run `bobby run plan TKT-001`
- Review the generated `plan.md` and `test-cases.md`
- Decide if the planning output is useful

**Week 3: Try the full pipeline**
- Run `bobby run pipeline TKT-001` end-to-end on one ticket
- Watch how agents hand off and what happens on rejection
- Use `bobby learn` to record any patterns you notice

**Week 4: Expand usage**
- Try `bobby run feature` for an epic
- Try `bobby run ux` or `bobby run pm` for product review
- Define a custom pipeline if the default doesn't fit

**Ongoing:**
- Use `bobby learn` to teach Bobby your patterns
- Run `bobby retro` to review agent performance
- Customize skills as needed (see [CUSTOMIZING.md](CUSTOMIZING.md))

## Minimal pipeline

If you want a shorter pipeline without code review:

```yaml
# .bobbyrc.yml
pipelines:
  default: [plan, build, test]
```

Or skip testing too:

```yaml
pipelines:
  default: [plan, build]
```
