// test/lib/license.test.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  verifyKey, checkPackLicense, licenseHelp, checkPro, activateKey,
  saveLicense, licenseFile, PRO_PRODUCT, PRO_PUBLIC_KEY,
} from '../../lib/license.js';

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function issue(privateKey, payload) {
  const part = b64url(JSON.stringify(payload));
  return `${part}.${b64url(crypto.sign(null, Buffer.from(part), privateKey))}`;
}

describe('pack licensing', () => {
  let keys, otherKeys, publicPem;

  beforeAll(() => {
    keys = crypto.generateKeyPairSync('ed25519');
    otherKeys = crypto.generateKeyPairSync('ed25519');
    publicPem = keys.publicKey.export({ type: 'spki', format: 'pem' });
  });

  describe('verifyKey', () => {
    it('accepts a key signed by the matching private key', () => {
      const key = issue(keys.privateKey, { product: 'demo-pack', buyer: 'someone@example.com', issued: '2026-07-25' });

      const payload = verifyKey(key, publicPem, { product: 'demo-pack' });

      expect(payload.buyer).toBe('someone@example.com');
    });

    it('rejects a key signed by a different key — the whole point', () => {
      const forged = issue(otherKeys.privateKey, { product: 'demo-pack', buyer: 'pirate' });

      expect(() => verifyKey(forged, publicPem)).toThrow(/not valid/i);
    });

    it('rejects a tampered payload even with a real signature attached', () => {
      const key = issue(keys.privateKey, { product: 'demo-pack', buyer: 'someone' });
      const [, signature] = key.split('.');
      const swapped = `${b64url(JSON.stringify({ product: 'demo-pack', buyer: 'someone-else' }))}.${signature}`;

      expect(() => verifyKey(swapped, publicPem)).toThrow(/not valid/i);
    });

    it('rejects a key issued for a different product', () => {
      const key = issue(keys.privateKey, { product: 'other-pack', buyer: 'someone' });

      expect(() => verifyKey(key, publicPem, { product: 'demo-pack' })).toThrow(/other-pack/);
    });

    it('rejects an expired key but accepts a lifetime one', () => {
      const expired = issue(keys.privateKey, { product: 'demo-pack', expires: '2020-01-01' });
      const lifetime = issue(keys.privateKey, { product: 'demo-pack' });

      expect(() => verifyKey(expired, publicPem)).toThrow(/expired/i);
      expect(verifyKey(lifetime, publicPem).product).toBe('demo-pack');
    });

    it('gives a readable error for junk input instead of crashing', () => {
      expect(() => verifyKey('not-a-key', publicPem)).toThrow(/does not look like a license key/i);
      expect(() => verifyKey('!!!.!!!', publicPem)).toThrow(/malformed|not valid/i);
      expect(() => verifyKey(null, publicPem)).toThrow(/does not look like/i);
    });
  });

  describe('checkPackLicense', () => {
    it('treats a pack with no license block as free', () => {
      const status = checkPackLicense({ id: 'free-pack', license: null });

      expect(status.ok).toBe(true);
      expect(status.required).toBe(false);
    });

    it('blocks a commercial pack when no key is activated', () => {
      const status = checkPackLicense({ id: 'paid-pack', license: { product: 'paid-pack', publicKey: publicPem, buy: 'https://example.com/buy' } });

      expect(status.ok).toBe(false);
      expect(status.required).toBe(true);
      // The message has to tell a buyer what to do next.
      const help = licenseHelp(status);
      expect(help).toMatch(/https:\/\/example.com\/buy/);
      expect(help).toMatch(/bobby pack activate/);
    });
  });

  // One SKU: a single Bobby Pro key opens every paid pack, now and later.
  describe('Bobby Pro', () => {
    const origHome = process.env.HOME;
    let tmpHome;
    const opts = () => ({ proPublicKey: publicPem });
    const proPack = (extra = {}) => ({ id: 'saas-multitenant', version: '1.0.0', license: { pro: true }, ...extra });
    const issuePro = (payload = {}) => issue(keys.privateKey, { product: PRO_PRODUCT, buyer: 'buyer@example.com', ...payload });

    beforeEach(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bobby-lic-'));
      process.env.HOME = tmpHome;
    });
    afterEach(() => {
      process.env.HOME = origHome;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('ships a public key that is a usable ed25519 key, not a mangled paste', () => {
      expect(() => crypto.createPublicKey(PRO_PUBLIC_KEY)).not.toThrow();
      expect(crypto.createPublicKey(PRO_PUBLIC_KEY).asymmetricKeyType).toBe('ed25519');
    });

    it('stores the key under the current home, so activation is per machine', () => {
      saveLicense(PRO_PRODUCT, issuePro());

      expect(licenseFile()).toBe(path.join(tmpHome, '.bobby', 'licenses.yml'));
      expect(fs.existsSync(licenseFile())).toBe(true);
    });

    it('unlocks a pro pack that carries no key of its own', () => {
      saveLicense(PRO_PRODUCT, issuePro());

      const status = checkPackLicense(proPack(), opts());

      expect(status.ok).toBe(true);
      expect(status.via).toBe('pro');
    });

    it('unlocks a pack that also has its own standalone key — Pro covers everything', () => {
      saveLicense(PRO_PRODUCT, issuePro());

      const status = checkPackLicense({ id: 'paid-pack', license: { product: 'paid-pack', publicKey: publicPem } }, opts());

      expect(status.ok).toBe(true);
      expect(status.via).toBe('pro');
    });

    it('blocks a pro pack with no Pro key and points at the checkout', () => {
      const status = checkPackLicense(proPack(), opts());

      expect(status.ok).toBe(false);
      const help = licenseHelp(status);
      expect(help).toMatch(/Bobby Pro/);
      expect(help).toMatch(/bobby pro activate/);
      expect(help).toMatch(/https?:\/\//);
    });

    it('refuses a Pro key forged with another signing key', () => {
      saveLicense(PRO_PRODUCT, issue(otherKeys.privateKey, { product: PRO_PRODUCT, buyer: 'pirate' }));

      expect(checkPro(opts()).active).toBe(false);
      expect(checkPackLicense(proPack(), opts()).ok).toBe(false);
    });

    // The promise on the sales page: you keep what you paid for, forever.
    describe('a lapsed subscription', () => {
      const lapsed = () => saveLicense(PRO_PRODUCT, issuePro({ expires: '2020-01-01' }));

      it('still opens the packs it paid for', () => {
        lapsed();

        const pro = checkPro(opts());
        expect(pro.active).toBe(true);
        expect(pro.lapsed).toBe(true);
        expect(checkPackLicense(proPack({ released: '2019-06-01' }), opts()).ok).toBe(true);
      });

      it('still opens packs that never declare a release date', () => {
        lapsed();

        expect(checkPackLicense(proPack(), opts()).ok).toBe(true);
      });

      it('does not open a pack released after the updates ended', () => {
        lapsed();

        const status = checkPackLicense(proPack({ released: '2026-07-01' }), opts());

        expect(status.ok).toBe(false);
        expect(status.reason).toMatch(/updates ended/i);
        expect(licenseHelp(status)).toMatch(/bobby pro activate/);
      });

      it('opens everything again once a current key replaces it', () => {
        lapsed();
        saveLicense(PRO_PRODUCT, issuePro({ expires: '2099-01-01' }));

        expect(checkPro(opts()).lapsed).toBe(false);
        expect(checkPackLicense(proPack({ released: '2026-07-01' }), opts()).ok).toBe(true);
      });
    });

    describe('activateKey', () => {
      it('activates Pro with no packs installed — you subscribe, then pull packs down', () => {
        const result = activateKey(issuePro(), [], opts());

        expect(result.pro).toBe(true);
        expect(result.payload.buyer).toBe('buyer@example.com');
        expect(checkPro(opts()).active).toBe(true);
      });

      it('accepts a lapsed key so a returning buyer can still restore their content', () => {
        const result = activateKey(issuePro({ expires: '2020-01-01' }), [], opts());

        expect(result.pro).toBe(true);
        expect(checkPro(opts()).lapsed).toBe(true);
      });

      it('falls back to a single-pack key when the key is not a Pro one', () => {
        const pack = { id: 'paid-pack', name: 'Paid Pack', license: { product: 'paid-pack', publicKey: publicPem } };
        const key = issue(keys.privateKey, { product: 'paid-pack', buyer: 'someone' });

        const result = activateKey(key, [pack], opts());

        expect(result.pro).toBe(false);
        expect(result.product).toBe('paid-pack');
        expect(checkPackLicense(pack, opts()).ok).toBe(true);
      });

      it('rejects a junk key and names what it tried', () => {
        expect(() => activateKey('not-a-key', [], opts())).toThrow(/did not match Bobby Pro/i);
        expect(() => activateKey(issue(otherKeys.privateKey, { product: PRO_PRODUCT }), [], opts())).toThrow(/Bobby Pro:/);
      });
    });
  });
});
