---
name: local-dev
description: "Local Dev Skill: Sets up and manages local development environments by profile name. MANDATORY TRIGGERS: setup, local dev, start the app, set up my local env, dev environment, docker compose issues, port conflicts, container problems, dev server won't start, fresh setup, environment variables, migration errors, npm install problems, health checks, daily startup, rebuild docker, check if everything is running."
argument-hint: "<profile> [fresh|daily|reset|check]"
---

# Bobby Local Skill

> Sets up the local development environment for a named profile. Run `/bobby-local <profile>` to stand up all repos and services for that project.

## Before Starting

1. **Check learnings** — Read `.claude/skills/bobby-local/learnings.md` + `.claude/skills/bobby-local/learnings.local.md`
2. **Parse the argument** — Extract the profile name and optional action:
   - `/bobby-local myproject` → profile `myproject`, action `fresh` (default for first run) or `daily` (if already set up)
   - `/bobby-local myproject reset` → profile `myproject`, action `reset`
   - `/bobby-local myproject check` → profile `myproject`, action `check`
   - `/bobby-local` with no argument → list available profiles

## Safety Rules

<safety_rules>
- Never delete `.env` files or credentials — they contain secrets that cannot be regenerated.
- Never run `docker compose down -v` without explicit user confirmation — it destroys database volumes.
- Never run destructive database commands (`rails db:reset`, `rails db:drop`, `DROP TABLE`, etc.) — these destroy data. Use safe alternatives like `rails db:prepare` or migrations.
- Do not modify CI configs, production env vars, or deploy scripts.
- Do not install global packages or modify system-level configuration.
</safety_rules>



## No Profiles Configured

Add a `local` block to `.bobbyrc.yml` to define named profiles:

```yaml
local:
  myproject:
    subdomain: myproject
    compose_project: myproject_dev
    ports: { api: 3000, ui: 3001 }
```

That's it — commands are auto-generated from your `stack` and `repos` config. Add `steps` to override:

```yaml
local:
  myproject:
    ports: { api: 3000, ui: 3001 }
    steps:
      fresh:
        - name: Start backend
          command: docker compose up --build
          cwd: backend-api
        - name: Start frontend
          command: npm run dev
          cwd: frontend-ui
```


### Falling Back to Default Commands

```bash
# configure commands.dev in .bobbyrc.yml
```



## Running the Setup

### Action: `check` (default when environment exists)

1. Run every health check for the profile
2. Report which services are up/down
3. Check for pending database migrations
4. Verify required env files exist

### Action: `fresh` (default for first run)

1. Verify prerequisites are installed
2. Check env files exist (prompt user to create from templates if missing)
3. Execute each step in order
4. Run all health checks to verify
5. Report final status

### Action: `daily`

1. Execute each step in order
2. Check for pending migrations: `git log --oneline origin/main..HEAD -- db/migrate`
3. Run health checks
4. Report status

### Action: `reset`

1. **Confirm with user** — list what will be destroyed
2. Execute reset steps
3. Run fresh steps to rebuild
4. Run health checks to verify

## Troubleshooting

If a health check fails:

1. **Check if the process is running** — `docker compose ps` or check process list
2. **Check logs** — Look for errors in service logs
3. **Check ports** — Ensure no port conflicts: `lsof -i :<port>`
4. **Check env vars** — Verify required environment files exist and have required values
5. **Check dependencies** — Ensure all packages are installed and up to date

If you discover a recurring issue or fix, save it:
`bobby learn bobby-local "pattern" "description"`

## Completing

After any action:
1. Run all health checks and report results
2. If something failed, diagnose and fix it or report the issue to the user
3. Log any new learnings discovered during setup

---

## Project overrides

If `.claude/skills/bobby-local/SKILL.local.md` exists, read it and follow it. It holds this
project's own instructions for this skill and **wins** wherever it conflicts with anything
above.

`SKILL.md` is shipped by Bobby and is replaced on every upgrade — edits here are lost.
`SKILL.local.md` is yours and is never overwritten.
