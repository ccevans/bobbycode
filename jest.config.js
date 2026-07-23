export default {
  transform: {},
  setupFiles: ['<rootDir>/test/setup.js'],
  // Only discover Bobby's own tests. Never pick up starter-template tests under
  // templates/starters/**, which are node:test files meant for scaffolded projects.
  roots: ['<rootDir>/test'],
};
