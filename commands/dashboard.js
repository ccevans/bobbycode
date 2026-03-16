// commands/dashboard.js
import { proGuard, LicenseError } from '../lib/license.js';
import { error } from '../lib/colors.js';

export function registerDashboard(program) {
  program
    .command('dashboard')
    .description('PRO: Terminal board dashboard')
    .action(async () => {
      try {
        await proGuard('dashboard');
        // TODO: Implement terminal dashboard UI
        console.log('Dashboard coming in next release. For now, use: bobby list');
      } catch (e) {
        if (e instanceof LicenseError) { error(e.message); process.exit(1); }
        throw e;
      }
    });
}
