// commands/activate.js
import { saveLicenseKey } from '../lib/license.js';
import { success, warn, error } from '../lib/colors.js';

export function registerActivate(program) {
  program
    .command('activate <key>')
    .description('Activate a Bobby Pro license key')
    .action(async (key) => {
      try {
        // Validate before saving (best-effort — if offline, save anyway with warning)
        try {
          const { proGuard } = await import('../lib/license.js');
          // Temporarily save to validate
          saveLicenseKey(key);
          await proGuard('dashboard'); // Will throw if invalid
          success('License validated');
        } catch (e) {
          if (e.name === 'LicenseError') {
            // Key didn't validate — remove it
            const fs = await import('fs');
            const os = await import('os');
            const path = await import('path');
            const licFile = path.join(os.homedir(), '.bobby', 'license');
            if (fs.existsSync(licFile)) fs.unlinkSync(licFile);
            error('License key is invalid. Check your key and try again.');
            process.exit(1);
          }
          // Network error — save anyway
          saveLicenseKey(key);
          warn('Could not validate online — saved locally. Will validate on next use.');
        }
        success('License saved');
        success('Pro features unlocked');
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
