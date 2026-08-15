// commands/vet.js
import { readConfig, findProjectRoot, resolveIdeasFile } from '../lib/config.js';
import { readIdeas } from '../lib/ideas.js';
import { inboxFile } from '../lib/registry.js';
import { buildVetPrompt } from '../lib/vet.js';
import { bold, dim, error } from '../lib/colors.js';

// Resolve a captured idea by its number — checks the current project's ideas
// first, then the global inbox. Returns the idea text, or null.
function ideaByNumber(n) {
  try {
    const root = findProjectRoot();
    const config = readConfig(root);
    const found = readIdeas(resolveIdeasFile(root, config)).find(i => i.n === n);
    if (found) return found.text;
  } catch { /* not in a project */ }
  try {
    const found = readIdeas(inboxFile()).find(i => i.n === n);
    if (found) return found.text;
  } catch { /* no inbox */ }
  return null;
}

export function registerVet(program) {
  program
    .command('vet <idea...>')
    .description('Pressure-test an idea before you build it — asks the right questions, one at a time')
    .action((ideaWords) => {
      try {
        let idea = ideaWords.join(' ').trim();
        // `bobby vet 3` vets captured idea #3 (project ideas or the global inbox).
        if (ideaWords.length === 1 && /^\d+$/.test(ideaWords[0])) {
          const resolved = ideaByNumber(parseInt(ideaWords[0], 10));
          if (resolved) idea = resolved;
        }
        if (!idea) throw new Error('Give me an idea: bobby vet "a habit tracker for runners"');

        const prompt = buildVetPrompt(idea);
        console.log('');
        console.log(`  ${bold('Vetting')} — ${dim(idea)}`);
        console.log(`  ${dim('Paste this into Claude Code — it will ask you one question at a time, then give a read:')}`);
        console.log('');
        console.log(prompt);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
