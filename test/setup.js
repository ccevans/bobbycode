// test/setup.js
// Jest setupFile — env here is inherited by CLI child processes spawned in tests.
// Keeps test runs from writing tmp projects into the developer's real
// ~/.bobby/projects.yml. Studio tests override HOME (and unset this) explicitly.
process.env.BOBBY_NO_REGISTRY = '1';
