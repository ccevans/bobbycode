// test/lib/dashboard/orchestrator-studio-run.test.js
//
// PRO-026: closes the end-to-end gap TKT-069 left. TKT-069 proved a studio
// ticket's worktree LANDS in the right (non-launch) code repo, but never ran an
// agent to confirm it could READ its ticket from there. The board lives at the
// STUDIO root; the agent's cwd is a worktree in a DIFFERENT code repo. A relative
// board reference resolves against that worktree, where the board does not
// exist — the reported "File does not exist".
//
// Faithfully faked: real fs + real git (a separate code repo with a real
// worktree under the studio root). No CLI is spawned — the "agent" is simulated
// by (a) reading the absolute ticket path the built prompt hands it, and (b)
// performing the stage move the way `bobby ticket move` does (findProjectRoot →
// resolveTicketsDir → moveTicket), asserting the write lands on the studio board.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { buildPromptFor, buildOrchestrationPrompt, buildFeaturePrompt, buildSingleAgentPrompt, DEFAULT_WORKFLOW } from '../../../lib/workflow.js';
import { createTicket, moveTicket, findTicket } from '../../../lib/tickets.js';
import { findProjectRoot, resolveTicketsDir } from '../../../lib/config.js';

const git = (cwd, cmd) => execSync(`git ${cmd}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# code repo\n');
  git(dir, 'add .');
  git(dir, 'commit -q -m "initial"');
  return dir;
}

/**
 * A studio on disk: board + product at the studio root, a SEPARATE code repo
 * (bobbycode-pro) whose worktree sits under the studio root (the default
 * `worktree_root` is a studio descendant). Returns the absolute board dir, the
 * real worktree path, and the created ticket id (stage `planning`).
 */
function makeStudioRun(tmp) {
  const studioRoot = path.join(tmp, 'studio');
  fs.mkdirSync(studioRoot, { recursive: true });
  // findProjectRoot walks up to whatever holds .bobbyrc.yml — the studio root.
  fs.writeFileSync(path.join(studioRoot, '.bobbyrc.yml'), 'studio: studio\n');

  // Board for the active project `pro` lives at the studio root.
  const ticketsDir = path.join(studioRoot, '.bobby', 'pro', 'tickets');
  fs.mkdirSync(ticketsDir, { recursive: true });
  const { id } = createTicket(ticketsDir, { prefix: 'PRO', title: 'studio work', repos: ['pro'] });
  moveTicket(ticketsDir, id, 'planning', 'test');

  // Product artifacts, also at the studio root.
  const productDir = path.join(studioRoot, '.bobby', 'product');
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'feature-map.md'), '# feature map\n');
  fs.writeFileSync(path.join(productDir, 'personas.md'), '# personas\n');

  // A separate code repo, with a real worktree UNDER the studio root — exactly
  // where the app places it and where the reported failure occurred.
  const codeRepo = initRepo(path.join(tmp, 'bobbycode-pro'));
  const worktreePath = path.join(studioRoot, 'repos', 'bobby-wt', `${id}-workflow`);
  git(codeRepo, `worktree add -q -b bobby/${id.toLowerCase()}-workflow "${worktreePath}"`);

  // config as production resolves it in studio mode with project `pro` selected.
  const config = { studio: 'studio', _project: 'pro' };

  return { studioRoot, ticketsDir, productDir, codeRepo, worktreePath, id, config };
}

/** Absolute path to the created ticket's ticket.md (resolves the {ID}* glob). */
function realTicketPath(ticketsDir, id) {
  const dir = fs.readdirSync(ticketsDir).find(e => e.startsWith(`${id}--`));
  return path.join(ticketsDir, dir, 'ticket.md');
}

// A sentinel absolute board dir. Prompts are rendered with this, then every
// INSTRUCTION that tells the agent to read/re-read/verify a board file must
// carry the sentinel — proving an absolute path was supplied for it. This is
// the guard the earlier version lacked: the old extractor REQUIRED a slash, so
// it silently skipped exactly the bare `ticket.md` refs that cause the bug
// (R1/R2 in review) — a test that could never fail on the thing it guarded.
const ABS = '/SENTINEL_STUDIO/.bobby/pro/tickets';

// The board files an agent is ever told to consult. The negative lookbehind
// excludes agent files — `.claude/agents/bobby-plan.md` contains "plan.md" but
// is code shipped in every worktree, not a board file, so it is never an
// offender (a preceding word-char or hyphen means it's part of a longer name).
const BOARD_FILE = /(?<![\w-])(ticket|plan|test-cases|feature-map|personas)\.md\b/;
const READ_VERB = /\b(read|re-read|verify|created in|load)\b/i;

/**
 * Every line of the prompt that instructs the agent to READ a board file but
 * does NOT carry an absolute (sentinel-rooted) path — i.e. a bare/relative ref
 * the agent would resolve against its worktree cwd. A non-empty result is a bug.
 */
function bareBoardReads(prompt) {
  return prompt.split('\n').filter((line) => {
    if (!BOARD_FILE.test(line) || !READ_VERB.test(line)) return false;
    return !line.includes(ABS);   // no absolute path on the same instruction
  });
}

describe('PRO-026: a studio agent run reads its ticket and writes to the studio board', () => {
  let tmp, cwd0;
  beforeEach(() => {
    cwd0 = process.cwd();
    // realpath so process.cwd() (realpathed by the OS) compares cleanly to our paths.
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-studiorun-')));
  });
  afterEach(() => {
    process.chdir(cwd0);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  // TC8 — NO prompt an agent runs on a studio ticket may contain a bare board
  // read. Covers all three builders that hand board paths to a worktree-isolated
  // agent: the workflow orchestration prompt, the single-agent prompt (with the
  // product hint), and the FEATURE prompt (where R1 hid — its Phase 1 was bare
  // while its Phase 2 was absolute). Rendered with the ABS sentinel so a bare
  // ref stands out as a line missing it. Reverting any of the four fixes puts a
  // bare read back and turns this red.
  test('TC8: no prompt for a studio agent contains a bare board read', () => {
    // Pure prompt-string guard — call the builders directly with the absolute
    // sentinel board dir. buildOrchestrationPrompt (not buildPromptFor) so no
    // filesystem ticket-existence check stands between us and the string.
    const workflowPrompt = buildOrchestrationPrompt(['TKT-001'], DEFAULT_WORKFLOW, 3, ABS, 20, '.claude/agents');

    const singleAgent = buildSingleAgentPrompt(
      'bobby-build', 'TKT-001', ABS, '.claude/agents', false, true, 'reviewing', ABS,
    );

    // childTickets carry a TOP-LEVEL `stage` (not `data.stage`) — that is what
    // buildFeaturePrompt filters `needsPlanning` on. At least one in backlog so
    // PHASE 1 renders; the earlier fixture used the wrong shape, so Phase 1 was
    // never in the string and the Phase-1 fixes went unguarded (review round 2).
    const feature = buildFeaturePrompt(
      'TKT-100', 'An epic',
      [{ id: 'TKT-101', stage: 'backlog' }, { id: 'TKT-102', stage: 'building' }],
      DEFAULT_WORKFLOW, 3, ABS, 20, '.claude/agents', {},
    );

    for (const [name, prompt] of [['workflow', workflowPrompt], ['single-agent', singleAgent], ['feature', feature]]) {
      const bare = bareBoardReads(prompt);
      expect({ prompt: name, bareReads: bare }).toEqual({ prompt: name, bareReads: [] });
    }
  });

  // TC8b — the absolute path the prompt supplies actually resolves from the
  // worktree cwd (resolution does not depend on cwd), the property TC8 asserts
  // the prompt relies on.
  test('TC8b: the absolute board path resolves from the code-repo worktree', () => {
    const { worktreePath, ticketsDir, id } = makeStudioRun(tmp);
    process.chdir(worktreePath);
    const ticketAbs = realTicketPath(ticketsDir, id);
    expect(fs.existsSync(ticketAbs)).toBe(true);
    expect(fs.statSync(ticketAbs).isFile()).toBe(true);
  });

  // TC9 — a faked agent reads its ticket from the worktree, then the stage move
  // it performs lands on the STUDIO board (not the code-repo worktree).
  test('TC9: faked agent reads the ticket and the stage move reaches the studio board', () => {
    const { ticketsDir, worktreePath, id, config } = makeStudioRun(tmp);

    // The agent's cwd is the code-repo worktree.
    process.chdir(worktreePath);

    // 1. Read the ticket via the absolute path the prompt hands it — succeeds
    //    even though `.bobby/pro/tickets` does not exist under the worktree.
    const ticketAbs = realTicketPath(ticketsDir, id);
    const before = fs.readFileSync(ticketAbs, 'utf8');
    expect(before).toContain('stage: planning');

    // 2. Perform the stage move the way `bobby ticket move` does from the
    //    worktree: findProjectRoot walks UP to the studio root, resolveTicketsDir
    //    returns the studio board, moveTicket writes there.
    const root = findProjectRoot();
    expect(root).toBe(path.join(tmp, 'studio'));
    const resolvedTicketsDir = resolveTicketsDir(root, config);
    expect(resolvedTicketsDir).toBe(ticketsDir);
    moveTicket(resolvedTicketsDir, id, 'building', 'bobby-plan');

    // 3. Re-read from the studio board: the write landed there, not in the worktree.
    expect(findTicket(ticketsDir, id).data.stage).toBe('building');
    expect(fs.readFileSync(ticketAbs, 'utf8')).toContain('stage: building');
  });

  // TC10 — pre-fix reproduction guard: the OLD relative reference does NOT
  // resolve from the worktree cwd (the exact failure the fix eliminates).
  test('TC10: a bare relative board path does not resolve from the code-repo worktree', () => {
    const { ticketsDir, worktreePath, id } = makeStudioRun(tmp);
    process.chdir(worktreePath);

    // Old behavior: resolve `.bobby/pro/tickets/PRO-001*/ticket.md` against cwd.
    const relativeBoard = path.join(process.cwd(), '.bobby', 'pro', 'tickets');
    expect(fs.existsSync(relativeBoard)).toBe(false);

    // The absolute path the fix hands the agent DOES resolve — the contrast.
    expect(fs.existsSync(realTicketPath(ticketsDir, id))).toBe(true);
  });
});
