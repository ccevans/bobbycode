// commands/velocity.js
import { proGuard, LicenseError } from '../lib/license.js';
import { error } from '../lib/colors.js';

export function registerVelocity(program) {
  program
    .command('velocity')
    .description('PRO: Ticket throughput metrics')
    .action(async () => {
      try {
        await proGuard('velocity');
        // TODO: Implement velocity metrics
        console.log('Velocity metrics coming in next release.');
      } catch (e) {
        if (e instanceof LicenseError) { error(e.message); process.exit(1); }
        throw e;
      }
    });
}
