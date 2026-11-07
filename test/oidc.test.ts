import { describe, it, expect } from 'vitest';
import { verifyGithubOidc } from '../worker/src/keys';
import { b64url } from '../worker/src/util';

// GitHub の代わりに、ここで作った鍵で証明を作って確かめる
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'test-key' } as JsonWebKey;
const keys = async () => [jwk];
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function token(claims: Record<string, unknown>, kid = 'test-key') {
  const head = enc({ alg: 'RS256', typ: 'JWT', kid });
  const t = Math.floor(Date.now() / 1000);
  const body = enc({ iss: 'https://token.actions.githubusercontent.com', aud: 'firmwatch', exp: t + 300, nbf: t - 5, repository: 'kajisho5/firmwatch', ref: 'refs/heads/main', ...claims });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

describe('GitHub Actions の証明', () => {
  it('正しい証明は通す', async () => {
    await expect(verifyGithubOidc(await token({}), 'kajisho5/firmwatch', keys)).resolves.toBeTruthy();
  });
  it('ほかのリポジトリからは断る', async () => {
    await expect(verifyGithubOidc(await token({ repository: 'someone/fork' }), 'kajisho5/firmwatch', keys)).rejects.toThrow();
  });
  it('main 以外のブランチからは断る', async () => {
    await expect(verifyGithubOidc(await token({ ref: 'refs/heads/feature' }), 'kajisho5/firmwatch', keys)).rejects.toThrow();
  });
  it('期限切れ・宛先違いは断る', async () => {
    await expect(verifyGithubOidc(await token({ exp: 1 }), 'kajisho5/firmwatch', keys)).rejects.toThrow();
    await expect(verifyGithubOidc(await token({ aud: 'other' }), 'kajisho5/firmwatch', keys)).rejects.toThrow();
  });
  it('書き換えられた証明は断る', async () => {
    const t = await token({});
    const [h, , s] = t.split('.');
    const forged = `${h}.${enc({ iss: 'https://token.actions.githubusercontent.com', aud: 'firmwatch', exp: 9e9, repository: 'kajisho5/firmwatch', ref: 'refs/heads/main', sub: 'x' })}.${s}`;
    await expect(verifyGithubOidc(forged, 'kajisho5/firmwatch', keys)).rejects.toThrow();
  });
  it('壊れた証明は 401 で断る', async () => {
    await expect(verifyGithubOidc('aaa.bbb.ccc', 'kajisho5/firmwatch', keys)).rejects.toMatchObject({ status: 401 });
  });
  it('知らない鍵の証明は断る', async () => {
    await expect(verifyGithubOidc(await token({}, 'unknown'), 'kajisho5/firmwatch', keys)).rejects.toThrow();
  });
});
