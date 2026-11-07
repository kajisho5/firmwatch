// ログイン（パスキー）とセッション
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Env, HttpError, now, DAY, randomId, sha256, b64url, fromB64url, str, recoveryCode, normalizeCode } from './util';

const COOKIE = 'fw_session';
const SESSION_DAYS = 180;
type C = Context<{ Bindings: Env; Variables: { userId: string } }>;

function rp(c: C) {
  const url = new URL(c.req.url);
  return { rpID: url.hostname, origin: url.origin, rpName: c.env.RP_NAME || 'FIRMWATCH' };
}

async function saveChallenge(c: C, challenge: string, userId: string | null) {
  const id = randomId();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(now()),
    c.env.DB.prepare('INSERT INTO challenges (id, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)').bind(id, challenge, userId, now() + 5 * 60_000),
  ]);
  return id;
}

async function takeChallenge(c: C, id: unknown) {
  if (typeof id !== 'string') throw new HttpError(400, 'やり直してください。');
  const row = await c.env.DB.prepare('DELETE FROM challenges WHERE id = ? RETURNING challenge, user_id, expires_at').bind(id).first<{ challenge: string; user_id: string | null; expires_at: number }>();
  if (!row || row.expires_at < now()) throw new HttpError(400, '時間が経ちすぎました。もう一度やり直してください。');
  return row;
}

export async function startSession(c: C, userId: string) {
  const token = randomId(32);
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, now() + SESSION_DAYS * DAY).run();
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: 'Lax', path: '/', maxAge: SESSION_DAYS * 86400 });
}

export async function currentUser(c: C): Promise<string | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await sha256(token), now()).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function logout(c: C) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
}

/** 新しく始める／パスキーを足す：登録の準備 */
export async function registerOptions(c: C, userId: string | null, name: string) {
  const { rpID, rpName } = rp(c);
  const uid = userId ?? randomId();
  const exclude = userId
    ? (await c.env.DB.prepare('SELECT id FROM passkeys WHERE user_id = ?').bind(userId).all<{ id: string }>()).results.map(r => ({ id: r.id }))
    : [];
  const options = await generateRegistrationOptions({
    rpName, rpID, userName: name, userDisplayName: name, userID: new TextEncoder().encode(uid),
    attestationType: 'none', excludeCredentials: exclude,
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const ticket = await saveChallenge(c, options.challenge, uid);
  return { options, ticket };
}

/** 登録の確認。新しい利用者なら作って引き継ぎコードを返す */
export async function registerVerify(c: C, body: any, existingUserId: string | null) {
  const ch = await takeChallenge(c, body?.ticket);
  const { rpID, origin } = rp(c);
  const v = await verifyRegistrationResponse({
    response: body?.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
  }).catch(() => ({ verified: false as const }));
  if (!v.verified) throw new HttpError(400, 'パスキーを確かめられませんでした。もう一度お試しください。');
  const cred = v.registrationInfo.credential;
  const userId = existingUserId ?? ch.user_id!;
  const stmts: D1PreparedStatement[] = [];
  let code: string | null = null;
  if (!existingUserId) {
    const name = str(body?.name, '名前', 40) ?? '名前なし';
    code = recoveryCode();
    stmts.push(c.env.DB.prepare('INSERT INTO users (id, name, created_at, recovery_hash) VALUES (?, ?, ?, ?)').bind(userId, name, now(), await sha256(normalizeCode(code))));
  }
  stmts.push(c.env.DB.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(cred.id, userId, b64url(cred.publicKey), cred.counter, JSON.stringify(cred.transports ?? []), now()));
  await c.env.DB.batch(stmts);
  if (!existingUserId) await startSession(c, userId);
  return { recoveryCode: code };
}

export async function loginOptions(c: C) {
  const { rpID } = rp(c);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
  const ticket = await saveChallenge(c, options.challenge, null);
  return { options, ticket };
}

export async function loginVerify(c: C, body: any) {
  const ch = await takeChallenge(c, body?.ticket);
  const credId = body?.response?.id;
  if (typeof credId !== 'string') throw new HttpError(400, 'パスキーを確かめられませんでした。');
  const pk = await c.env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(credId).first<{ id: string; user_id: string; public_key: string; counter: number; transports: string | null }>();
  if (!pk) throw new HttpError(400, 'このパスキーは登録されていません。「新しく始める」か「引き継ぎコードで入る」を使ってください。');
  const { rpID, origin } = rp(c);
  const v = await verifyAuthenticationResponse({
    response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
    credential: { id: pk.id, publicKey: fromB64url(pk.public_key), counter: pk.counter, transports: JSON.parse(pk.transports || '[]') },
  }).catch(() => ({ verified: false as const }));
  if (!v.verified) throw new HttpError(400, 'パスキーを確かめられませんでした。もう一度お試しください。');
  await c.env.DB.prepare('UPDATE passkeys SET counter = ? WHERE id = ?').bind(v.authenticationInfo.newCounter, pk.id).run();
  await startSession(c, pk.user_id);
}

/** 引き継ぎコードで入る（入ったあと、画面からこの端末のパスキーを足してもらう） */
export async function recover(c: C, body: any) {
  const code = normalizeCode(String(body?.code ?? ''));
  if (code.length !== 20) throw new HttpError(400, '引き継ぎコードは「XXXX-XXXX-XXXX-XXXX-XXXX」の20文字です。');
  const row = await c.env.DB.prepare('SELECT id FROM users WHERE recovery_hash = ?').bind(await sha256(code)).first<{ id: string }>();
  if (!row) throw new HttpError(400, '引き継ぎコードが違います。');
  await startSession(c, row.id);
}

export async function newRecoveryCode(c: C, userId: string) {
  const code = recoveryCode();
  await c.env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').bind(await sha256(normalizeCode(code)), userId).run();
  return code;
}
