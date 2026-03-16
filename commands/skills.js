// commands/skills.js
import { proGuard, LicenseError } from '../lib/license.js';
import { error } from '../lib/colors.js';

export function registerSkills(program) {
  program
    .command('skills [action]')
    .description('PRO: Install/update skill packs')
    .action(async (action) => {
      try {
        await proGuard('skills');
        // TODO: Implement skill pack management
        console.log('Skill packs coming in next release.');
      } catch (e) {
        if (e instanceof LicenseError) { error(e.message); process.exit(1); }
        throw e;
      }
    });
}
