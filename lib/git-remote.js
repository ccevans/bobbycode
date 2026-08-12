// lib/git-remote.js
//
// The repository this project came from, as `owner/repo` (TKT-012).
//
// It is the one fact .bobbyrc.yml does not hold. Config knows the project's
// NAME — a slug someone typed at `bobby init` — while the Feature view's
// sublabel is specified as `ccevans/bobbycode · TKT-001`, which is where the
// code actually lives. `git remote get-url origin` is the only thing that knows
// that, so it is what is read here.
//
// **Absence is an answer, not a failure.** A project `bobby new` just scaffolded
// has a git repo and no remote; a remote can point at a path on this machine; a
// machine need not have git on it at all. Every one of those returns null, the
// server sends null, and the UI falls back to the project name. Nothing in this
// file throws.

import { execSync } from 'child_process';

/**
 * `owner/repo` from a git remote URL, or null when the URL does not name one.
 *
 * The three forms git itself writes:
 *
 *   https://github.com/ccevans/bobbycode.git
 *   git@github.com:ccevans/bobbycode.git        scp-like — no scheme, colon
 *   ssh://git@github.com/ccevans/bobbycode      a real URL again
 *
 * The answer is the LAST TWO path segments, whatever the host. GitHub, GitLab,
 * Bitbucket and a self-hosted Gitea all put owner and repo there, and a host
 * allowlist would return null for precisely the self-hosted repos that have no
 * other name to show. A nested GitLab path therefore yields its last group and
 * the repo — the same pair GitLab's own breadcrumb ends with.
 *
 * A URL with no host is a path on this machine (`../vendor/thing`,
 * `/srv/git/mirror.git`, `file:///…`). Those name a directory, not an owner, so
 * they are null rather than a fabricated `srv/mirror`.
 */
export function parseGitRemote(url) {
  const raw = String(url == null ? '' : url).trim();
  if (!raw) return null;

  let pathname;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    // A real URL. `new URL` also strips any user:password before the host,
    // which is how a token in a remote stays out of the answer.
    let parsed;
    try { parsed = new URL(raw); } catch { return null; }
    // file:// parses fine and has an empty host — that is the local-path case.
    if (!parsed.hostname) return null;
    pathname = parsed.pathname;
  } else if (/^[^/\s]+:/.test(raw)) {
    // scp-like `[user@]host:path`: the colon arrives before any slash.
    pathname = raw.slice(raw.indexOf(':') + 1);
  } else {
    return null;   // a bare filesystem path
  }

  const segments = pathname.replace(/\.git$/i, '').split('/').filter(Boolean);
  // One segment is a host and a repo with no owner — there is no pair to give.
  if (segments.length < 2) return null;
  return segments.slice(-2).join('/');
}

/**
 * `owner/repo` for the origin remote of the repo at `repoRoot`, or null.
 *
 * Not memoized: a remote can be added with `git remote add` while the server is
 * up, and the one caller (/api/config) is fetched once per page load, so a
 * cache would buy nothing and could only ever be wrong.
 */
export function originRepo(repoRoot) {
  let url;
  try {
    url = execSync('git remote get-url origin', {
      cwd: repoRoot || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Deliberately silent, and the one place in this codebase where that is
    // right: "no origin configured", "not a git repository" and "git: command
    // not found" are three spellings of one answer the caller already handles —
    // there is no remote to name. A `bobby new` project is in that state by
    // construction, so logging here would print a warning on every page load of
    // a project that is working exactly as designed.
    return null;
  }
  return parseGitRemote(url);
}
