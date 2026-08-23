// lib/stages.js
import chalk from 'chalk';

export const STAGES = [
  'backlog',
  // Product definition pipeline — used by the `define` workflow on the MVP
  // epic. Brief → personas → journeys → feature map, then the epic moves to
  // planning for traceable decomposition. Ordinary tickets skip these.
  'define-brief',
  'define-personas',
  'define-journeys',
  'define-features',
  'define-mockups',
  'define-blueprint',
  'planning',
  // Design pipeline — used by the `design` workflow. Ordinary tickets skip
  // these entirely, the same way `quick` skips reviewing.
  'design-research',
  'design-analyze',
  'design-mockup',
  'design-spec',
  'building',
  // Used by the `secure` workflow. It needs a stage of its own rather than
  // sharing `reviewing`: the FSM resolves a stage to the FIRST step holding it,
  // so two steps on one stage make the second unreachable and let the first
  // hand off to itself — an infinite loop under auto_approve_stages (TKT-049).
  'security',
  'reviewing',
  'testing',
  'shipping',
  'done',
  'blocked',
];

// Friendly aliases for `bobby ticket move` command
export const TRANSITIONS = {
  plan:    'planning',
  build:   'building',
  security: 'security',
  review:  'reviewing',
  test:    'testing',
  ship:    'shipping',
  done:    'done',
  research: 'design-research',
  analyze:  'design-analyze',
  mockup:   'design-mockup',
  spec:     'design-spec',
  brief:    'define-brief',
  personas: 'define-personas',
  journeys: 'define-journeys',
  features: 'define-features',
  // Plural on purpose: `mockup` (singular, above) is the design pipeline's
  // stage. One letter apart, two pipelines — both must keep resolving.
  mockups:  'define-mockups',
  blueprint: 'define-blueprint',
  // reject and block/unblock are handled specially in move.js
};

export function isValidStage(stage) {
  return STAGES.includes(stage);
}

export function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

export function resolveTransition(alias) {
  return TRANSITIONS[alias] || (isValidStage(alias) ? alias : null);
}

export function stageColor(stage) {
  const colors = {
    'backlog':   chalk.dim,
    'define-brief':    chalk.magentaBright,
    'define-personas': chalk.magentaBright,
    'define-journeys': chalk.magentaBright,
    'define-features': chalk.magentaBright,
    'define-mockups': chalk.magentaBright,
    'define-blueprint': chalk.magentaBright,
    'planning':  chalk.cyan,
    'design-research': chalk.magenta,
    'design-analyze':  chalk.magenta,
    'design-mockup':   chalk.magenta,
    'design-spec':     chalk.magenta,
    'building':  chalk.blue,
    // Yellow with the other gate stages — security, reviewing and testing all
    // check work rather than produce it. Red is reserved for blocked.
    'security':  chalk.yellow,
    'reviewing': chalk.yellow,
    'testing':   chalk.yellow,
    'shipping':  chalk.green,
    'done':      chalk.green,
    'blocked':   chalk.red,
  };
  return colors[stage] || chalk.reset;
}
