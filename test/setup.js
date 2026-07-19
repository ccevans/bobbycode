// test/setup.js
// Jest setupFile — env here is inherited by CLI child processes spawned in tests.
// Keeps test runs from writing tmp projects into the developer's real
// ~/.bobby/projects.yml. Studio tests override HOME (and unset this) explicitly.
process.env.BOBBY_NO_REGISTRY = '1';

// Give git an identity for tests that shell out to `git commit` (worktree tests,
// init auto-commit). Env vars beat missing user.name/email config, so the suite
// passes on a bare CI runner without any global git config.
process.env.GIT_AUTHOR_NAME = process.env.GIT_AUTHOR_NAME || 'Bobby Test';
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_AUTHOR_EMAIL || 'test@bobby.dev';
process.env.GIT_COMMITTER_NAME = process.env.GIT_COMMITTER_NAME || 'Bobby Test';
process.env.GIT_COMMITTER_EMAIL = process.env.GIT_COMMITTER_EMAIL || 'test@bobby.dev';
