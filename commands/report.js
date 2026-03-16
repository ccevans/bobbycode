// commands/report.js
import { proGuard, LicenseError } from '../lib/license.js';
import { error } from '../lib/colors.js';

export function registerReport(program) {
  program
    .command('report')
    .description('PRO: Weekly shipped summary')
    .action(async () => {
      try {
        await proGuard('report');
        // TODO: Implement weekly report
        console.log('Weekly report coming in next release.');
      } catch (e) {
        if (e instanceof LicenseError) { error(e.message); process.exit(1); }
        throw e;
      }
    });
}
