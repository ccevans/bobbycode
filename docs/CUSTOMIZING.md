# Customizing Bobby

After `bobby init`, everything Bobby scaffolds is yours to edit. This guide covers the main customization points.

## Adding Custom Agents and Skills

Bobby agents are markdown files in `.claude/agents/`. Skills are instruction sets in `.claude/skills/<name>/`.

To add a custom agent:

1. Create the skill directory:
   ```
   .claude/skills/my-linter/
     SKILL.md        # Detailed instructions for the agent
     learnings.md    # Anti-patterns and best practices (starts empty)
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

3. Optionally add it to a custom pipeline (see below).

Bobby prefixes its own agents with `bobby-`. Your custom agents can use any name that doesn't start with `bobby-` to avoid collisions on re-init.

## Defining Custom Pipelines

The default pipeline chains: plan -> build -> review -> test.

Define named pipelines in `.bobbyrc.yml`:

```yaml
pipelines:
  default: [plan, build, review, test]
  secure: [plan, build, security, review, test]
  fast: [plan, build, test]
  thorough: [plan, build, review, security, test, docs]
```

Run a named pipeline:

```bash
bobby run pipeline TKT-001 --pipeline secure
```

## Modifying Skill Behavior

All skill files in `.claude/skills/bobby-*/SKILL.md` are yours to edit after init. Common modifications:

- Add project-specific rules (e.g., "always use our design system components")
- Adjust review criteria (e.g., stricter performance thresholds)
- Change test expectations (e.g., require integration tests, not just unit tests)

**Note:** Re-running `bobby init` will overwrite bobby-prefixed skills. Commit your customizations first, or use `bobby learn` for incremental improvements that survive re-init.

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
  "skill_routing": {
    "auth": ["dev/backend"],
    "api": ["dev/backend"],
    "live-views": ["dev/fullstack"],
    "admin": ["dev/backend"]
  },
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
| `skill_routing` | object | Maps areas to skill directories |
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

Use areas when creating tickets: `bobby create -t "Fix login" --area auth`

**Skill routing** maps areas to project skill directories, so the build agent loads area-specific conventions:

```yaml
skill_routing:
  auth: [dev/fullstack]
  api: [dev/backend]
  dashboard: [dev/frontend]
```

This means when building a ticket with `area: api`, the build agent will also read `.claude/skills/dev/backend/SKILL.md`.

## Configuration Reference

All options are documented with comments in the generated `.bobbyrc.yml`. Run `bobby init` to see the full commented config, or refer to the optional sections at the bottom of your existing config file.
