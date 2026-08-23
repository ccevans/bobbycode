// lib/router.js
// The natural-language front door. `bobby do "<request>"` can't route with a
// model (Bobby is deterministic Node), so it emits a dispatch prompt: the full
// capability catalog + the user's request, and lets the executing agent pick the
// single best-matching skill/command and run it. Same catalog drives the
// CLAUDE.md intent-routing section so in-session talking routes the same way.

// One source of truth for "what can Bobby do, and when." `run` entries load a
// skill/agent; `cmd` entries are CLI commands the agent should run directly.
export const CAPABILITIES = [
  { when: 'implement / add / build / change / fix a specific thing in this project', do: 'bobby go "<the task, restated>"', note: 'creates a ticket and runs the right workflow (add --workflow secure|quick when it fits)' },
  { when: 'just keep going / what\'s next / make progress', do: 'bobby go', note: 'runs the single most useful next step' },
  { when: 'start a new project / build a new app from scratch', do: 'bobby new "<idea>"', note: 'scaffolds a running project from the idea' },
  { when: 'is this a good idea? / should I build this? / pressure-test / validate an idea', do: 'bobby vet "<idea>"', note: 'interrogates the idea, gives a PURSUE/REFINE/PARK read' },
  { when: 'is this production-ready? / is it safe to launch / what\'s missing before customers / harden this / make it enterprise-grade', do: 'bobby audit', note: 'scores the codebase on security, reliability, operability, change safety; add --tickets to turn every gap into work' },
  { when: 'remember this / note / idea for later / capture a thought', do: 'bobby idea "<text>"', note: 'captures without touching the board' },
  { when: 'where am I? / status / what\'s in flight / what\'s blocked / what\'s next', do: 'bobby brief', note: 'the where-was-I summary' },
  { when: 'define the product / write the brief / personas / user journeys / feature map / what should v1 be / scope the MVP', do: 'bobby run define <epicId>', note: 'brief → personas → journeys → data model → architecture → feature map → mockups → blueprint, a human gate at each stage; then bobby-plan decomposes traceably' },
  { when: 'design a page / landing page / make it look good / visual identity / it looks generic or AI-made', do: 'bobby run design <id>', note: 'the design pipeline: references → teardowns → mockups → locked spec → build → check' },
  { when: 'show me the plan / what are we building / overview / blueprint / see it before we build', do: 'bobby blueprint', note: 'one page from the locked definition + the board: crux, tracks, every traceable ticket, what is out of scope' },
  { when: 'plan / break down / refine a ticket or epic', do: 'bobby run plan <id>', note: 'loads bobby-plan; needs a ticket' },
  { when: 'review the code / code review', do: 'bobby run review <id>', note: 'fresh-eyes diff review; needs a ticket' },
  { when: 'test the app / QE / verify it works in the running app', do: 'bobby run test <id>', note: 'tests the live app, not specs; needs a ticket' },
  { when: 'security audit / security review / is this safe / are we leaking secrets', do: 'bobby run security <id>', note: 'OWASP + STRIDE on changed code; needs a ticket' },
  { when: 'debug / investigate / why is this broken / X does nothing / root cause', do: 'bobby run debug <id>', note: 'root-cause investigation; needs a ticket' },
  { when: 'skip the ceremony / one agent, no stages / just do the whole ticket / freewill', do: 'bobby run freewill <id>', note: 'one agent start-to-shipping on few instructions (Opus 5 / Fable 5); no fresh-eyes reviewer, so not for security-sensitive, underspecified, or epic-sized work' },
  { when: 'review the design / UX audit / how does it look', do: 'bobby run ux', note: 'reviews the live app in the browser; no ticket needed' },
  { when: 'product review / PM review / what\'s missing as a product', do: 'bobby run pm', note: 'live-app product review; no ticket needed' },
  { when: 'ship it / open a PR / release / get it live', do: 'bobby run ship <id>', note: 'creates the PR, waits for CI; needs a ticket' },
  { when: 'update the docs / document the release', do: 'bobby run docs', note: 'syncs README/CHANGELOG; no ticket needed' },
  { when: 'check performance / benchmark / is it slow', do: 'bobby run performance', note: 'page-load + resource benchmarking; no ticket needed' },
  { when: 'understand / map the codebase / architecture', do: 'bobby run arch', note: 'discovers + documents architecture; no ticket needed' },
  { when: 'verify the deploy / production health check', do: 'bobby run watchdog', note: 'post-deploy health verification; no ticket needed' },
  { when: 'turn this pasted spec / PRD into work / a ticket', do: 'bobby run intake', note: 'parses a PM/JIRA spec into a populated ticket' },
  { when: 'batch several related tickets onto one branch', do: 'bobby sprint new "<name>" <ids...>', note: 'then bobby sprint run' },
  { when: 'record a lesson / anti-pattern so agents stop repeating it', do: 'bobby learn <skill> "<pattern>" "<desc>"', note: 'appends to the skill\'s learnings' },
  { when: 'record an architectural decision / constraint the codebase must hold to', do: 'bobby decision add --id <id> --fact "<what>" --why "<why>"', note: 'appends to .bobby/decisions.yaml; bobby-review checks changed code against every active entry. `bobby decision list` to read them' },
];

export function buildDispatchPrompt(request) {
  const catalog = CAPABILITIES.map(c => `- **${c.when}** → \`${c.do}\`${c.note ? ` — ${c.note}` : ''}`).join('\n');
  return `The user asked Bobby to do something. Route it to the right Bobby capability and carry it out.

**The request:** "${request}"

## What Bobby can do (match the request to the single best one)
${catalog}

## How to route
1. Pick the **one** capability that best fits the request. Prefer the most specific match.
2. If it's a concrete change to *this* project ("add…", "fix…", "make…", "build…") and nothing more specific fits, treat it as build work — **create a ticket and run it** with \`bobby go "${request}"\`. Pick the workflow:
   - **secure** (\`bobby go "${request}" --workflow secure\`) when it touches auth, payments, crypto, secrets, user data, permissions, or anything security-sensitive.
   - **quick** (\`--workflow quick\`) for a tiny, low-risk change (copy tweak, small style fix).
   - otherwise the default workflow (just \`bobby go "${request}"\`).
3. **Resolving \`<id>\`** for the "needs a ticket" capabilities:
   - If the request points at a specific ticket, find its id with \`bobby ticket list\`.
   - If there's no ticket yet (a fresh symptom like "the login button does nothing", or a one-off "audit for leaked secrets"), the simplest correct route is \`bobby go "${request}"\` — it creates the ticket and runs the workflow. Only reach for \`bobby run <verb>\` directly when a matching ticket already exists.
4. **Do it** — run the chosen \`bobby …\` command with real values, then follow whatever prompt or skill it emits.
5. Ask **one** short clarifying question first only when the request is genuinely ambiguous between very different capabilities (e.g. "clean up and make it faster and prettier" spans build + performance + UX) — otherwise act.

State which capability you picked and why in one line, then proceed.`;
}
