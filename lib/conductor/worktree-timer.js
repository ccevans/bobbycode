// lib/conductor/worktree-timer.js
//
// `bobby conductor reap --worktrees --print-plist` (BOB-193). Prints a launchd job that runs
// `bobby conductor reap --worktrees --apply` every worktree_timer.interval_minutes on the M4,
// so done-ticket worktrees go away without a human. Printing changes nothing; CC (or a lane he
// names) installs it:
//
//   bobby conductor reap --worktrees --print-plist > ~/Library/LaunchAgents/com.bobby.conductor.reap-worktrees.plist
//   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bobby.conductor.reap-worktrees.plist
//
// launchd starts jobs with a bare environment, so the plist carries absolute paths for node and
// bobby, the studio as the working directory (findStudioRoot walks up from it), and the PATH of
// the shell that printed it. A PATH without git, claude or sysctl is an error here rather than
// a job that fails every hour.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const TIMER_LABEL = 'com.bobby.conductor.reap-worktrees';

// The reap reads `claude agents`, runs git, and checks the host with sysctl (node runs bobby).
const NEEDED_ON_PATH = ['git', 'claude', 'sysctl'];

const BOBBY_BIN = fileURLToPath(new URL('../../bin/bobby.js', import.meta.url));

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The first executable `name` on PATH, as written there (not resolved), or null. */
function onPath(name, pathEnv) {
  for (const dir of pathEnv.split(':').filter(Boolean)) {
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {
      // not in this folder
    }
  }
  return null;
}

/**
 * The plist text. `env` is the printing shell's environment (PATH and HOME are required).
 * node is the first `node` on that PATH, kept as written: Homebrew's /opt/homebrew/opt/node@22
 * link survives `brew upgrade`, the Cellar path it resolves to does not. `bobby` is the bobby
 * entry point of the checkout that prints the plist, resolved.
 */
export function buildWorktreeTimerPlist({ studioRoot, config, env = process.env, bobby = BOBBY_BIN }) {
  const { interval_minutes: minutes, log_file: log } = config.worktree_timer;
  if (!env.PATH) throw new Error('PATH is not set; the launchd job needs it to find git and claude');
  if (!env.HOME) throw new Error('HOME is not set; the launchd job needs it for claude');
  const missing = [...NEEDED_ON_PATH, 'node'].filter(name => !onPath(name, env.PATH));
  if (missing.length) {
    throw new Error(`${missing.join(', ')} not found on PATH (${env.PATH}); the launchd job could not run the reap. Print the plist from a shell where they resolve.`);
  }
  // launchd does not create the log's folder; a missing one would lose every run's output.
  if (!fs.existsSync(path.dirname(log))) {
    throw new Error(`worktree_timer.log_file: folder ${path.dirname(log)} does not exist; launchd will not create it`);
  }
  const bin = fs.realpathSync(bobby);
  const args = [onPath('node', env.PATH), bin, 'conductor', 'reap', '--worktrees', '--apply'];
  const str = (v) => `\t\t<string>${escapeXml(v)}</string>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>Label</key>',
    `\t<string>${TIMER_LABEL}</string>`,
    '\t<key>ProgramArguments</key>',
    '\t<array>',
    ...args.map(str),
    '\t</array>',
    '\t<key>WorkingDirectory</key>',
    `\t<string>${escapeXml(studioRoot)}</string>`,
    '\t<key>EnvironmentVariables</key>',
    '\t<dict>',
    '\t\t<key>HOME</key>',
    `\t\t<string>${escapeXml(env.HOME)}</string>`,
    '\t\t<key>PATH</key>',
    `\t\t<string>${escapeXml(env.PATH)}</string>`,
    '\t</dict>',
    '\t<key>StartInterval</key>',
    `\t<integer>${minutes * 60}</integer>`,
    '\t<key>RunAtLoad</key>',
    '\t<false/>',
    '\t<key>StandardOutPath</key>',
    `\t<string>${escapeXml(log)}</string>`,
    '\t<key>StandardErrorPath</key>',
    `\t<string>${escapeXml(log)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}
