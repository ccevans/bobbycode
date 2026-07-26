// test/lib/license.test.js
import crypto from 'crypto';
import { verifyKey, checkPackLicense, licenseHelp } from '../../lib/license.js';

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
});
