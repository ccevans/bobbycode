// lib/stages.js
import chalk from 'chalk';

export const STAGES = [
  '0-ideas',
  '1-backlog',
  '2-ready-for-refinement',
  '3-ready-for-development',
  '4-in-progress',
  '5-ready-for-review',
  '6-ready-for-testing',
  '7-ready-for-release',
  '8-needs-rework',
  '9-blocked',
  '10-released',
];

export function isValidStage(stage) {
  return STAGES.includes(stage);
}

export function stageIndex(stage) {
  return STAGES.indexOf(stage);
}

export function stageColor(stage) {
  const colors = {
    '0-ideas': chalk.dim,
    '1-backlog': chalk.dim,
    '2-ready-for-refinement': chalk.cyan,
    '3-ready-for-development': chalk.cyan,
    '4-in-progress': chalk.blue,
    '5-ready-for-review': chalk.yellow,
    '6-ready-for-testing': chalk.yellow,
    '7-ready-for-release': chalk.green,
    '8-needs-rework': chalk.red,
    '9-blocked': chalk.red,
    '10-released': chalk.green,
  };
  return colors[stage] || chalk.reset;
}
