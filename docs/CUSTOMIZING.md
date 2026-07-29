# Customizing Bobby

## The one rule: `.local` files are yours

Every file Bobby scaffolds is either **shipped** or **yours**, and you can tell which from the
filename:

| Shipped — replaced on every upgrade | Yours — never overwritten |
|---|---|
| `.claude/skills/<skill>/SKILL.md` | `.claude/skills/<skill>/SKILL.local.md` |
| `.claude/skills/<skill>/learnings.md` | `.claude/skills/<skill>/learnings.local.md` |
| `.claude/agents/<agent>.md` | `.claude/agents/<agent>.local.md` |
| `.claude/commands/<cmd>.md` | `.claude/commands/<cmd>.local.md` |
| everything above `<!-- bobby:end -->` in `CLAUDE.md` | everything below it, plus `CLAUDE.local.md` |

`X.local.ext` sits **on top of** `X.ext` and **wins** wherever the two disagree. Agents are told
to read both. It's the same convention as Claude Code's own `settings.local.json`.

**Put your customizations in the `.local` file.** Editing a shipped file works until your next
upgrade, and then it's gone — that's the point of shipped files: you get the improvements.

```bash
# add a rule for this project's design work — survives every upgrade
echo "Never use teal. The client hates it." >> .claude/skills/bobby-design/SKILL.local.md

# same idea for an agent
echo "Always run \`make verify\` before committing." >> .claude/agents/bobby-build.local.md
```

These files are meant to be committed — they're how your team shares project conventions.

The rest of this guide covers the other customization points.

## Adding Custom Agents and Skills

The fast path:

```bash
bobby skill create deploy-check "Verify staging health before any deploy." --agent
```

That scaffolds the skill folder, seeds its `learnings.local.md`, and (with `--agent`) creates
the agent file so `bobby run deploy-check` works immediately. The name must be kebab-case and
must not start with `bobby-` — the command enforces both.

**Naming standard** (same one Bobby's shipped skills follow): kebab-case, verb-noun —
`deploy-check`, `review-copy`, `vet-pricing`. The folder name is the skill's name everywhere:
`bobby run <name>`, `bobby learn <name>`, and Claude Code's auto-discovery all key off it.

To do the same by hand:

1. Create the skill directory:
   ```
   .claude/skills/my-linter/
     SKILL.md              # Detailed instructions for the agent
     learnings.local.md    # Anti-patterns — `bobby learn my-linter` writes here
   ```

2. Create the agent definition:
   ```
   .claude/agents/my-linter.md
   ```

   Agent markdown format:
   ```markdown
   ---
   name: my-linter
   description: Runs custom lint rules and fixes violations
   ---

   Load and follow the skill at `.claude/skills/my-linter/SKILL.md`.

   Before starting, read `.claude/skills/my-linter/learnings.md`.
   ```

3. Optionally add it to a custom workflow (see below).

**The `bobby-` prefix is reserved.** Everything Bobby ships is named `bobby-*`, and
`bobby init --refresh` treats that namespace as its own: stale `bobby-*` agents and commands
from older versions are *removed* on refresh. Name your custom agents, skills, and commands
anything else (`deploy-check`, `my-linter`) and Bobby will never touch them — not to
overwrite, not to prune. This applies to pack authors too.

**Custom agents are runnable by name.** `bobby run <your-agent>` works for any
`.claude/agents/<your-agent>.md` — no registration needed. It can claim tickets like a shipped
agent, and you can slot it into a custom workflow (below). Add a
`.claude/agents/<your-agent>.local.md` if you want per-project tweaks layered on a shared
definition.

**Pinning and rollback.** `bobby upgrade --to 1.1.0` installs that exact version and
re-scaffolds from it — files a newer version added are pruned, and your `.local` files and
data survive in both directions. Staying on an old version is fine: nothing phones home, and
refresh only ever scaffolds from the version you have installed.

## Defining Custom Workflows

The default workflow chains: plan -> build -> review -> test.

Define named workflows in `.bobbyrc.yml`:

```yaml
workflows:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  fast: [plan, build, test]
  thorough: [plan, build, review, security, test, docs]
```

Run a named workflow:

```bash
bobby run workflow TKT-001 --workflow secure
```

## Modifying Skill Behavior

Write your changes to `.claude/skills/bobby-*/SKILL.local.md` — **not** `SKILL.md`. The skill
reads both and your file wins. Common modifications:

- Add project-specific rules (e.g., "always use our design system components")
- Adjust review criteria (e.g., stricter performance thresholds)
- Change test expectations (e.g., require integration tests, not just unit tests)

**Why not edit `SKILL.md` directly?** It's shipped, so re-scaffolding and upgrading both replace
it — that's how you receive new rules and fixes. Your `SKILL.local.md` is never touched.

### Teaching Bobby with `bobby learn`

Record patterns so agents avoid repeating mistakes:

```bash
bobby learn bobby-build "hard-coded test values" "Implement the algorithm, don't match test inputs"
bobby learn bobby-review "missing error handling" "Check all async calls have try/catch"
```

Learnings are stored in `learnings.md` within each skill directory and loaded by agents before every run.

## Adding Project-Specific Build Skills

If your project has conventions the build agent should follow (API patterns, component library rules, etc.):

1. Create a skill directory:
   ```
   .claude/skills/api-patterns/
     SKILL.md    # Your project's API conventions
   ```

2. Register it in `.bobbyrc.yml`:
   ```yaml
   build_skills:
     - api-patterns
     - component-library
   ```

3. The bobby-build agent will read these skills during the build stage.

During `bobby init` (full mode), Bobby auto-detects non-bobby skills in `.claude/skills/` and offers to register them.

## Creating a Custom Stack

Bobby ships with 8 built-in stacks: `nextjs`, `rails-react`, `django`, `python-flask`, `go`, `rust`, `polyglot`, and `generic`. You can also create project-local stacks for frameworks Bobby doesn't ship with:

1. Create `.bobby/stacks/<name>.json`:

```json
{
  "name": "phoenix",
  "display": "Elixir / Phoenix",
  "health_checks": [
    { "name": "app", "url": "http://localhost:4000", "description": "Phoenix dev server" }
  ],
  "areas": ["auth", "api", "live-views", "admin"],
  "commands": {
    "dev": "mix phx.server",
    "test": "mix test",
    "lint": "mix credo",
    "build": "mix compile"
  },
  "testing_tools": ["curl"],
  "template_vars": {
    "test_command": "mix test",
    "lint_command": "mix credo",
    "spec_dir": "test/"
  }
}
```

2. Run `bobby init` — your custom stack will appear in the stack selection list.

### Stack JSON Schema

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Internal identifier |
| `display` | string | Display name shown during init |
| `health_checks` | array | `[{ name, url, description }]` — dev server URLs to verify |
| `areas` | array | Feature areas for ticket categorization |
| `commands` | object | `{ dev, test, lint, build }` — shell commands |
| `testing_tools` | array | Tools for the test agent (e.g., `["playwright", "curl"]`) |
| `template_vars` | object | Variables injected into skill templates |
| `repos` | array | (optional) Multi-repo hints: `[{ name, path_hint }]` |
| `services` | boolean | (optional) Enable multi-service detection |

## Customizing Areas and Skill Routing

**Areas** categorize tickets so agents can apply targeted guidance:

```yaml
areas:
  - auth
  - dashboard
  - api
  - billing
  - admin
```

Use areas when creating tickets: `bobby ticket create -t "Fix login" --area auth`

This means when building a ticket with `area: api`, the build agent will also read `.claude/skills/dev/backend/SKILL.md`.

## Configuration Reference

All options are documented with comments in the generated `.bobbyrc.yml`. Run `bobby init` to see the full commented config, or refer to the optional sections at the bottom of your existing config file.
