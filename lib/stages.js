// lib/stages.js
import chalk from 'chalk';

export const STAGES = [
  'backlog',
  'planning',
  'building',
  'reviewing',
  'testing',
  'shipping',
  'done',
  'blocked',
];

// Friendly aliases for `bobby move` command
export const TRANSITIONS = {
  plan:    'planning',
  build:   'building',
  review:  'reviewing',
  test:    'testing',
  ship:    'shipping',
  done:    'done',
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
    'planning':  chalk.cyan,
    'building':  chalk.blue,
    'reviewing': chalk.yellow,
    'testing':   chalk.yellow,
    'shipping':  chalk.green,
    'done':      chalk.green,
    'blocked':   chalk.red,
  };
  return colors[stage] || chalk.reset;
}
