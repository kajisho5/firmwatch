// 鍵まわり：通知用の鍵（VAPID）を最初に自動で作って保存する／定期チェック（GitHub Actions）の本人確認
import { Env, HttpError, b64url, fromB64url, now } from './util';

/** 通知用の鍵。無ければ作って D1 に保存する（人が鍵を作って入れなくてよいように） */
export async function vapid(env: Env): Promise<{ publicKey: string; privateKey: string }> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first<{ value: string }>();
  if (row) return JSON.parse(row.value);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey;
  const keys = { publicKey: b64url(pub), privateKey: jwk.d! };
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  // 同時に作られたときは、先に保存されたほうを使う
  const saved = await env.DB.prepare("SELECT value FROM settings WHERE key = 'vapid'").first<{ value: string }>();
  return JSON.parse(saved!.value);
}

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'firmwatch';
let jwksCache: { at: number; keys: JsonWebKey[] } | null = null;

async function githubKeys(force = false): Promise<JsonWebKey[]> {
  if (!force && jwksCache && now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`${ISSUER}/.well-known/jwks`);
  if (!res.ok) throw new HttpError(503, 'GitHub の鍵を読めませんでした。');
  const { keys } = await res.json() as { keys: JsonWebKey[] };
  jwksCache = { at: now(), keys };
  return keys;
}

/**
 * GitHub Actions が発行した証明（OIDC の JWT）を確かめる。
 * 発行元・宛先・期限と、指定したリポジトリ・main ブランチからの実行であることを見る
 */
export async function verifyGithubOidc(token: string, repo: string, getKeys: (force?: boolean) => Promise<JsonWebKey[]> = githubKeys) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, '証明の形が違います。');
  const dec = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)));
  let header: any, claims: any;
  try { header = dec(parts[0]); claims = dec(parts[1]); } catch { throw new HttpError(401, '証明の形が違います。'); }
  if (header.alg !== 'RS256') throw new HttpError(401, '証明の形が違います。');
  let jwk = (await getKeys()).find(k => (k as any).kid === header.kid);
  if (!jwk) jwk = (await getKeys(true)).find(k => (k as any).kid === header.kid);
  if (!jwk) throw new HttpError(401, '証明の鍵が見つかりません。');
  const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new HttpError(401, '証明が正しくありません。');
  const t = Math.floor(now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !aud.includes(AUDIENCE) || !(claims.exp > t) || !(claims.nbf == null || claims.nbf <= t + 60)) throw new HttpError(401, '証明の期限か宛先が違います。');
  if (!repo || claims.repository !== repo) throw new HttpError(401, 'このリポジトリからの実行ではありません。');
  if (claims.ref !== 'refs/heads/main') throw new HttpError(401, 'main 以外からの実行は受け付けません。');
  return claims;
}
