// ---- Bobby workflow runtime (shared by every generated script) -------------
// Plain JS. The generator emits WORKFLOW_NAME, STEPS, EXEC_STEPS, PLAN_STEP and
// TERMINAL above this text. The Workflow tool supplies agent, phase, log, args.
// No clock, no randomness: the same args must replay the same prompts so that
// resumeFromRunId serves finished agents from cache.

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    ticket: { type: 'string' },
    stage: { type: 'string', description: 'The Stage: line `bobby ticket view <id>` prints after your work' },
    verdict: { type: 'string', enum: ['advanced', 'rejected', 'blocked', 'mismatch', 'incomplete', 'passed', 'failed'] },
    reason: { type: 'string', description: 'One line' },
  },
  required: ['ticket', 'stage', 'verdict', 'reason'],
};

const OK_STATUSES = ['complete', 'done', 'done-on-entry'];
const CAP = { iterationCap: true };
const BUILD = STEPS.find(s => s.stage === 'building') || null;

function invalid(what) {
  throw new Error(`bobby-${WORKFLOW_NAME}: ${what} — run the invocation \`bobby run …\` printed`);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function validateArgs(a) {
  if (a === null || typeof a !== 'object' || Array.isArray(a)) invalid('args must be a JSON object');
  if (!['tickets', 'feature', 'sprint'].includes(a.mode)) invalid(`args.mode must be tickets, feature or sprint (got ${JSON.stringify(a.mode)})`);
  if (!Array.isArray(a.tickets) || a.tickets.length === 0) invalid('args.tickets must be a non-empty array');
  for (const t of a.tickets) {
    if (t === null || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.stage !== 'string') {
      invalid('every args.tickets entry needs a string id and a string stage');
    }
  }
  if (!Number.isInteger(a.maxRetries) || a.maxRetries < 0) invalid('args.maxRetries must be an integer >= 0');
  if (!Number.isInteger(a.maxIterations) || a.maxIterations < 1) invalid('args.maxIterations must be an integer >= 1');
  if (!isStringArray(a.readFirst)) invalid('args.readFirst must be an array of strings');
  if (!isStringArray(a.planReadFirst)) invalid('args.planReadFirst must be an array of strings');
  if (a.mode !== 'tickets') {
    const f = a.finalize;
    if (f === null || typeof f !== 'object' || !['epic', 'sprint'].includes(f.kind) || typeof f.id !== 'string') {
      invalid('args.finalize must be {kind: "epic" | "sprint", id} in feature and sprint mode');
    }
  }
}

validateArgs(args);

let iterations = 0;

// Every agent goes through here, so the cap counts stage, debug, integration
// and finalize agents alike.
async function call(prompt, opts) {
  if (iterations >= args.maxIterations) throw CAP;
  iterations++;
  return agent(prompt, { schema: RESULT_SCHEMA, ...opts });
}

function stagePrompt(t, step, { acceptBacklog, readFirst }) {
  const lines = [];
  lines.push(`You are ${step.agent} working on ticket ${t.id} (Bobby workflow "${WORKFLOW_NAME}").`);
  lines.push(`1. Run \`bobby ticket view ${t.id}\`.`);
  lines.push(`   - If the ticket is blocked, change nothing and return verdict "blocked" with the blocked reason.`);
  if (acceptBacklog) {
    lines.push(`   - If its Stage: line is "backlog", run \`bobby ticket move ${t.id} ${step.stage}\` first.`);
  }
  lines.push(`   - If its Stage: line is not "${step.stage}", change nothing and return verdict "mismatch" with stage = the stage you saw.`);
  lines.push(`2. Claim: \`bobby ticket assign ${t.id} ${step.agent}\`.`);
  let n = 3;
  if (readFirst.length > 0) {
    lines.push(`${n++}. Read these for context if they exist: ${readFirst.map(p => `\`${p}\``).join(', ')}.`);
  }
  if (step.stage === 'testing') {
    lines.push(`${n++}. Before testing, curl the project's health check URLs; if they fail, start the dev server. Test the live app, not specs.`);
  }
  if (args.hasServices) {
    lines.push(`${n++}. Read the ticket's \`services\` field; if present, read \`.bobbyrc.yml\` services and run test/lint/build from each service's path.`);
  }
  lines.push(`${n++}. Follow your agent instructions end to end.`);
  lines.push(`${n++}. When done, move: \`bobby ticket move ${t.id} ${step.next}\` — use exactly \`${step.next}\`, even if your agent file or skill names another stage. If you reject the work instead, move it the way your instructions say (\`bobby ticket move ${t.id} reject "<reason>"\`).`);
  lines.push(`${n++}. Verify \`git status --short\` shows no uncommitted source files.`);
  lines.push(`${n}. Run \`bobby ticket view ${t.id}\` again and return: ticket, stage (its Stage: line now), verdict (advanced | rejected | blocked | incomplete), reason (one line).`);
  return lines.join('\n');
}

function debugPrompt(t) {
  return `Follow your debug instructions on ticket ${t.id} (Bobby workflow "${WORKFLOW_NAME}"). The ticket stays in building — do not move it. Run \`bobby ticket view ${t.id}\` afterwards and return: ticket, stage (its Stage: line now), verdict (advanced | incomplete), reason (one line).`;
}

function integrationPrompt(t) {
  const suite = args.commands && args.commands.test
    ? `\`${args.commands.test}\``
    : `the project's full test suite`;
  return [
    `You are the integration check for ticket ${t.id} (Bobby workflow "${WORKFLOW_NAME}"). Its stages are done and it sits in "${TERMINAL}".`,
    `1. Run ${suite} on the current branch.`,
    `2. If everything passes, change nothing and return verdict "passed" with stage "${TERMINAL}".`,
    `3. If anything fails, run \`bobby ticket move ${t.id} reject "integration: <first failure>"\`, then \`bobby ticket view ${t.id}\`, and return verdict "failed" with stage = its Stage: line now.`,
    `Return: ticket, stage, verdict, reason (one line).`,
  ].join('\n');
}

function finalizePrompt() {
  const f = args.finalize;
  const test = args.commands && args.commands.test ? `\`${args.commands.test}\`` : `the project's full test suite`;
  const lint = args.commands && args.commands.lint ? ` and lint (\`${args.commands.lint}\`)` : '';
  const done = f.kind === 'epic'
    ? `\`bobby ticket move ${f.id} ship\``
    : `\`bobby sprint status ${f.id} done\``;
  return [
    `You are finalizing ${f.kind} ${f.id} (Bobby workflow "${WORKFLOW_NAME}"). Every ticket has finished its stages.`,
    `1. Run ${test}${lint}.`,
    `2. If everything passes, run ${done} and return verdict "passed".`,
    `3. Otherwise change nothing and return verdict "failed" with the first failure as the reason.`,
    `Return: ticket (use "${f.id}"), stage (use "n/a"), verdict, reason (one line).`,
  ].join('\n');
}

const byId = {};

async function runTicket(t, steps, phaseTitle, { stopOutside = false, readFirst = args.readFirst } = {}) {
  const res = { id: t.id, status: null, stage: t.stage, rejections: 0, reason: '' };
  byId[t.id] = res;
  const finish = (status, stage, reason) => {
    res.status = status;
    if (stage !== undefined) res.stage = stage;
    res.reason = reason || '';
    return res;
  };

  if (t.stage === 'done') {
    log(`${t.id}: already done, skipped`);
    return finish('done-on-entry', 'done');
  }
  if (t.blocked === true || t.stage === 'blocked') {
    log(`${t.id}: blocked, skipped (${t.blockedReason || 'no reason recorded'})`);
    return finish('blocked', t.stage, t.blockedReason || '');
  }

  // A rejection is a move back into the build stage from anywhere else. Returns
  // a final result when the ticket must stop, else null (after any debug run).
  async function afterResult(r, fromStage) {
    const rejected = BUILD !== null && r.stage === BUILD.stage && fromStage !== BUILD.stage;
    if (!rejected) return null;
    res.rejections++;
    if (res.rejections > args.maxRetries) {
      log(`${t.id}: rejected ${res.rejections} times, over the retry cap of ${args.maxRetries}, stopped`);
      return finish('max-retries', r.stage, r.reason);
    }
    if (res.rejections === 2) {
      const dr = await call(debugPrompt(t), { agentType: 'bobby-debug', label: `${t.id} bobby-debug`, phase: phaseTitle });
      if (dr === null) {
        log(`${t.id}: bobby-debug produced no result, stopped`);
        return finish('agent-failed', r.stage, 'bobby-debug produced no result');
      }
    }
    return null;
  }

  let stage = t.stage;
  let acceptBacklog = false;
  if (stage === 'backlog') {
    acceptBacklog = true;
    stage = steps[0].stage;
  }

  while (true) {
    if (stage === TERMINAL) {
      if (stopOutside) return finish('planned', stage);
      if (args.mode === 'tickets') return finish('complete', stage);
      const ir = await call(integrationPrompt(t), { label: `${t.id} integration`, phase: phaseTitle });
      if (ir === null) {
        log(`${t.id}: integration agent produced no result, stopped`);
        return finish('agent-failed', stage, 'integration agent produced no result');
      }
      // Decide by where the ticket is now, not by the verdict the agent chose.
      if (ir.stage === TERMINAL) {
        if (ir.verdict === 'passed') return finish('complete', TERMINAL, ir.reason);
        log(`${t.id}: integration returned "${ir.verdict}" but left the ticket in "${TERMINAL}", stopped`);
        return finish('stalled', TERMINAL, ir.reason);
      }
      // The ticket moved (normally back to building): same path as a stage agent.
      const out = await afterResult(ir, stage);
      if (out) return out;
      stage = ir.stage;
      continue;
    }
    if (stage === 'done') return finish('done', 'done');

    const step = steps.find(s => s.stage === stage);
    if (!step) {
      if (stopOutside) return finish('planned', stage);
      log(`${t.id}: stage "${stage}" is outside workflow "${WORKFLOW_NAME}", skipped`);
      return finish('outside-workflow', stage);
    }

    const r = await call(stagePrompt(t, step, { acceptBacklog, readFirst }), {
      agentType: step.agent,
      label: `${t.id} ${step.agent}`,
      phase: phaseTitle,
    });
    acceptBacklog = false;
    if (r === null) {
      log(`${t.id}: ${step.agent} produced no result, stopped (no substitute agent)`);
      return finish('agent-failed', stage, `${step.agent} produced no result`);
    }
    if (r.verdict === 'blocked') {
      log(`${t.id}: blocked by ${step.agent} (${r.reason})`);
      return finish('blocked', r.stage, r.reason);
    }
    if (r.stage === stage) {
      log(`${t.id}: ${step.agent} left the ticket in "${stage}" (${r.reason}), stopped`);
      return finish('stalled', stage, r.reason);
    }
    if (r.verdict === 'mismatch') {
      log(`${t.id}: snapshot said "${stage}" but the ticket is in "${r.stage}", continuing from there`);
      stage = r.stage;
      continue;
    }
    const out = await afterResult(r, stage);
    if (out) return out;
    stage = r.stage;
  }
}

let finalize = null;
try {
  if (args.mode === 'feature') {
    phase('Plan');
    for (const t of args.tickets) {
      if (t.stage !== 'backlog' && t.stage !== 'planning') continue;
      await runTicket(t, [PLAN_STEP], 'Plan', {
        stopOutside: true,
        readFirst: [...args.readFirst, ...args.planReadFirst],
      });
    }
    phase('Execute');
    for (const t of args.tickets) {
      const planned = byId[t.id];
      if (planned && planned.status !== 'planned') continue;
      const startStage = planned ? planned.stage : t.stage;
      if (startStage === 'backlog' || startStage === 'planning') {
        log(`${t.id}: still in "${startStage}" after the Plan phase, not built`);
        byId[t.id] = { id: t.id, status: 'not-planned', stage: startStage, rejections: 0, reason: '' };
        continue;
      }
      await runTicket({ ...t, stage: startStage }, EXEC_STEPS, 'Execute');
    }
  } else {
    phase('Execute');
    for (const t of args.tickets) {
      await runTicket(t, STEPS, 'Execute');
    }
  }

  if (args.mode !== 'tickets') {
    const notOk = args.tickets.map(t => byId[t.id]).filter(r => !OK_STATUSES.includes(r.status));
    if (notOk.length > 0) {
      log(`Finalize skipped: ${notOk.map(r => `${r.id}=${r.status}`).join(', ')}`);
      finalize = 'skipped';
    } else {
      phase('Finalize');
      const fr = await call(finalizePrompt(), { label: 'finalize' });
      finalize = fr === null ? { verdict: 'agent-failed', reason: 'finalize agent produced no result' } : fr;
    }
  }
} catch (e) {
  if (e !== CAP) throw e;
  log(`Stopped: ${iterations}/${args.maxIterations} agent invocations used`);
  for (const r of Object.values(byId)) {
    if (r.status === null) r.status = 'iteration-cap';
    else if (r.status === 'planned') r.status = 'not-started';
  }
  if (args.mode !== 'tickets') finalize = 'skipped';
}

const report = {
  workflow: WORKFLOW_NAME,
  mode: args.mode,
  iterations,
  maxIterations: args.maxIterations,
  tickets: args.tickets.map(t => byId[t.id] || { id: t.id, status: 'not-started', stage: t.stage, rejections: 0, reason: '' }),
  finalize,
};
return report;
