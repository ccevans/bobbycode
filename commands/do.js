// commands/do.js
import { buildDispatchPrompt } from '../lib/router.js';
import { bold, dim, error } from '../lib/colors.js';

export function registerDo(program) {
  program
    .command('do <request...>')
    .description('Just say what you want — Bobby figures out which skill or command to use')
    .action((requestWords) => {
      try {
        const request = requestWords.join(' ').trim();
        if (!request) throw new Error('Tell me what to do: bobby do "add a health check endpoint"');
        const prompt = buildDispatchPrompt(request);
        console.log('');
        console.log(`  ${bold('Bobby, do:')} ${dim(request)}`);
        console.log(`  ${dim('Paste this into Claude Code — it routes to the right skill and runs it:')}`);
        console.log('');
        console.log(prompt);
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
