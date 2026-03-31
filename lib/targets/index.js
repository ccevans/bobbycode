// lib/targets/index.js
import claudeCode from './claude-code.js';
import cline from './cline.js';

const targets = {
  'claude-code': claudeCode,
  'cline': cline,
};

export const TARGETS = Object.keys(targets);

export function getTarget(name = 'claude-code') {
  const target = targets[name];
  if (!target) {
    throw new Error(`Unknown target '${name}'. Valid targets: ${TARGETS.join(', ')}`);
  }
  return target;
}
