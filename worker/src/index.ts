import { Hono } from 'hono';
import { compareVersions } from '../../shared/version.js';
import { Env, HttpError, now, randomId, str, date } from './util';
import { currentUser, logout, registerOptions, registerVerify, loginOptions, loginVerify, recover, newRecoveryCode, startSession } from './auth';
import { ingest, pushResult } from './internal';
import { vapid, verifyGithubOidc } from './keys';

type V = { Bindings: Env; Variables: { userId: string } };
const app = new Hono<V>();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  console.error(err);
  return c.json({ error: 'サーバーで問題が起きました。時間をおいてもう一度お試しください。' }, 500);
});

// 書き込みは同じサイトからの JSON だけ受け付ける（よそのサイトからの操作を防ぐ）
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET') {
    const origin = c.req.header('Origin');
    if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, '別のサイトからの操作は受け付けません。');
    if (c.req.method !== 'DELETE' && !(c.req.header('Content-Type') || '').includes('application/json')) throw new HttpError(415, 'JSON で送ってください。');
  }
  await next();
});

const body = async (c: any) => c.req.json().catch(() => ({}));

// ---- ログイン（ログインしていなくても使える） ----
app.post('/api/auth/register/options', async c => {
  const b = await body(c);
  const name = str(b.name, '名前', 40) ?? '名前なし';
  return c.json(await registerOptions(c, null, name));
});
app.post('/api/auth/register/verify', async c => c.json(await registerVerify(c, await body(c), null)));
app.post('/api/auth/login/options', async c => c.json(await loginOptions(c)));
app.post('/api/auth/login/verify', async c => { await loginVerify(c, await body(c)); return c.json({ ok: true }); });
app.post('/api/auth/recover', async c => { await recover(c, await body(c)); return c.json({ ok: true }); });
app.post('/api/auth/logout', async c => { await logout(c); return c.json({ ok: true }); });
app.get('/api/push/vapid', async c => c.json({ key: (await vapid(c.env)).publicKey }));

// 開発用ログイン（DEV_AUTH=1 かつ localhost のときだけ）
app.post('/api/dev/login', async c => {
  const host = new URL(c.req.url).hostname;
  if (c.env.DEV_AUTH !== '1' || !['localhost', '127.0.0.1'].includes(host)) throw new HttpError(404, 'ありません。');
  const b = await body(c);
  const id = 'dev-' + (str(b.id, 'id', 20) ?? 'user');
  await c.env.DB.prepare('INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)').bind(id, str(b.name, '名前', 40) ?? 'テスト太郎', now()).run();
  await startSession(c, id);
  return c.json({ ok: true, id });
});

// ---- ここから先はログインが要る ----
app.use('/api/*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (p.startsWith('/api/auth/') || p === '/api/push/vapid' || p === '/api/dev/login') return next();
  const uid = await currentUser(c);
  if (!uid) throw new HttpError(401, 'ログインしてください。');
  c.set('userId', uid);
  await next();
});

app.get('/api/me', async c => {
  const u = await c.env.DB.prepare('SELECT id, name, digest_weekday, digest_hour, os_macos, os_windows, os_ipados FROM users WHERE id = ?').bind(c.get('userId')).first();
  if (!u) throw new HttpError(401, 'ログインしてください。');
  const subs = await c.env.DB.prepare('SELECT endpoint, label, created_at FROM push_subs WHERE user_id = ? ORDER BY created_at').bind(c.get('userId')).all();
  const passkeys = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?').bind(c.get('userId')).first<{ n: number }>();
  return c.json({ user: u, pushSubs: subs.results, passkeys: passkeys?.n ?? 0 });
});

app.patch('/api/me', async c => {
  const b = await body(c);
  const sets: string[] = [], vals: unknown[] = [];
  if ('name' in b) { sets.push('name = ?'); vals.push(str(b.name, '名前', 40) ?? '名前なし'); }
  if ('digest_weekday' in b) { const v = Number(b.digest_weekday); if (!(v >= 0 && v <= 6)) throw new HttpError(400, '曜日が正しくありません。'); sets.push('digest_weekday = ?'); vals.push(v); }
  if ('digest_hour' in b) { const v = Number(b.digest_hour); if (!(v >= 0 && v <= 23)) throw new HttpError(400, '時刻が正しくありません。'); sets.push('digest_hour = ?'); vals.push(v); }
  for (const k of ['os_macos', 'os_windows', 'os_ipados']) if (k in b) { sets.push(`${k} = ?`); vals.push(b[k] ? 1 : 0); }
  if (sets.length) await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, c.get('userId')).run();
  return c.json({ ok: true });
});

app.post('/api/me/recovery', async c => c.json({ recoveryCode: await newRecoveryCode(c, c.get('userId')) }));
app.post('/api/me/passkey/options', async c => {
  const u = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(c.get('userId')).first<{ name: string }>();
  return c.json(await registerOptions(c, c.get('userId'), u?.name ?? '名前なし'));
});
app.post('/api/me/passkey/verify', async c => { await registerVerify(c, await body(c), c.get('userId')); return c.json({ ok: true }); });

// ---- 通知の登録 ----
app.post('/api/push/subscribe', async c => {
  const b = await body(c);
  const endpoint = str(b.endpoint, '通知先', 1000), p256dh = str(b.keys?.p256dh, '鍵', 200), auth = str(b.keys?.auth, '鍵', 100);
  if (!endpoint || !p256dh || !auth || !endpoint.startsWith('https://')) throw new HttpError(400, '通知の登録に失敗しました。');
  await c.env.DB.prepare('INSERT INTO push_subs (endpoint, user_id, p256dh, auth, label, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label')
    .bind(endpoint, c.get('userId'), p256dh, auth, str(b.label, '端末名', 60), now()).run();
  return c.json({ ok: true });
});
app.post('/api/push/unsubscribe', async c => {
  const b = await body(c);
  await c.env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(b.endpoint ?? ''), c.get('userId')).run();
  return c.json({ ok: true });
});

// ---- 機種の検索 ----
app.get('/api/models', async c => {
  const q = (c.req.query('q') || '').replace(/[\s\-_/.()（）%]/g, '').toLowerCase().slice(0, 60);
  if (q.length < 2) return c.json({ models: [] });
  const rows = await c.env.DB.prepare(`SELECT m.id, m.maker, m.model, m.sub, m.discontinued, m.source_key, s.label AS source_label FROM models m LEFT JOIN sources s ON s.key = m.source_key
    WHERE m.search LIKE ? ORDER BY (m.search LIKE ?) DESC, m.discontinued, (m.source_key IS NULL), m.maker, m.model LIMIT 40`).bind(`%${q}%`, `%${q}`).all();
  return c.json({ models: rows.results });
});

// 最新バージョン（取得先ごと）
async function latestBySource(env: Env) {
  const rows = (await env.DB.prepare(`SELECT r.source_key, r.version, r.title, r.released_at, r.url, r.severity, r.notes FROM releases r`).all<any>()).results;
  const best = new Map<string, any>();
  for (const r of rows) {
    const b = best.get(r.source_key);
    if (!b || compareVersions(r.version, b.version) > 0) best.set(r.source_key, r);
  }
  return best;
}

/** 1台の状態：old=古い（赤）/ ok=最新（緑）/ unset=今のバージョン未入力 / manual=自動確認なし / stopped=確認が止まっている / unknown=まだ確認していない */
function stateOf(u: any, latest: any) {
  if (!u.source_key) return 'manual';
  if (u.source_ok === 0) return 'stopped';
  if (!latest) return 'unknown';
  if (!u.current_version) return 'unset';
  return compareVersions(u.current_version, latest.version) < 0 ? 'old' : 'ok';
}

const GEAR_SQL = `SELECT g.*, m.maker, m.model, m.sub, m.source_key, m.control_sw, s.label AS source_label, s.ok AS source_ok, s.page_url, s.checked_at
  FROM gear g LEFT JOIN models m ON m.id = g.model_id LEFT JOIN sources s ON s.key = m.source_key`;

function shapeGear(u: any, latest: Map<string, any>) {
  const l = u.source_key ? latest.get(u.source_key) ?? null : null;
  return {
    id: u.id, model_id: u.model_id, maker: u.maker ?? u.custom_maker ?? '', model: u.model ?? u.custom_model ?? '', sub: u.sub ?? '',
    source_key: u.source_key, source_label: u.source_label, page_url: u.page_url, checked_at: u.checked_at,
    asset_no: u.asset_no, serial: u.serial, purchased_on: u.purchased_on, purchased_from: u.purchased_from,
    current_version: u.current_version, last_updated_on: u.last_updated_on, note: u.note, created_at: u.created_at,
    latest: l ? { version: l.version, title: l.title, released_at: l.released_at, url: l.url } : null,
    state: stateOf(u, l),
  };
}

app.get('/api/gear', async c => {
  const latest = await latestBySource(c.env);
  const rows = (await c.env.DB.prepare(`${GEAR_SQL} WHERE g.user_id = ? ORDER BY COALESCE(m.maker, g.custom_maker), COALESCE(m.model, g.custom_model), g.asset_no`).bind(c.get('userId')).all<any>()).results;
  return c.json({ gear: rows.map(r => shapeGear(r, latest)) });
});

function gearFields(b: any) {
  return {
    asset_no: str(b.asset_no, '管理番号', 40), serial: str(b.serial, 'シリアル番号', 80), purchased_on: date(b.purchased_on, '購入日'),
    purchased_from: str(b.purchased_from, '購入先', 80), current_version: str(b.current_version, '今のバージョン', 40), note: str(b.note, 'メモ', 400),
  };
}

app.post('/api/gear', async c => {
  const b = await body(c);
  const f = gearFields(b);
  let modelId: number | null = null, cm: string | null = null, cmo: string | null = null;
  if (b.model_id != null) {
    const m = await c.env.DB.prepare('SELECT id FROM models WHERE id = ?').bind(Number(b.model_id)).first<{ id: number }>();
    if (!m) throw new HttpError(400, '機種が見つかりません。');
    modelId = m.id;
  } else {
    cm = str(b.custom_maker, 'メーカー', 60); cmo = str(b.custom_model, '機種名', 80);
    if (!cm || !cmo) throw new HttpError(400, 'メーカーと機種名を入れてください。');
  }
  const count = Math.min(Math.max(Number(b.count) || 1, 1), 50);
  const ids: string[] = [];
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomId();
    ids.push(id);
    stmts.push(c.env.DB.prepare('INSERT INTO gear (id, user_id, model_id, custom_maker, custom_model, asset_no, serial, purchased_on, purchased_from, current_version, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, c.get('userId'), modelId, cm, cmo, count > 1 ? null : f.asset_no, count > 1 ? null : f.serial, f.purchased_on, f.purchased_from, f.current_version, f.note, t));
    if (f.current_version) stmts.push(c.env.DB.prepare('INSERT INTO gear_updates (id, gear_id, from_version, to_version, updated_on, recorded_by, note, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)')
      .bind(randomId(), id, f.current_version, f.purchased_on ?? new Date(t + 9 * 3600_000).toISOString().slice(0, 10), await nameOf(c), '登録時', t));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ids });
});

async function nameOf(c: any) {
  const u = await c.env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(c.get('userId')).first();
  return (u?.name as string) ?? '';
}

async function ownGear(c: any, id: string) {
  const g = await c.env.DB.prepare(`${GEAR_SQL} WHERE g.id = ? AND g.user_id = ?`).bind(id, c.get('userId')).first();
  if (!g) throw new HttpError(404, 'この機材は見つかりません。');
  return g;
}

app.get('/api/gear/:id', async c => {
  const g = await ownGear(c, c.req.param('id'));
  const latest = await latestBySource(c.env);
  const log = await c.env.DB.prepare('SELECT * FROM gear_updates WHERE gear_id = ? ORDER BY updated_on DESC, created_at DESC').bind(g.id).all();
  return c.json({ gear: shapeGear(g, latest), updates: log.results });
});

app.patch('/api/gear/:id', async c => {
  const g = await ownGear(c, c.req.param('id'));
  const b = await body(c);
  const f = gearFields({ ...g, ...b });
  await c.env.DB.prepare('UPDATE gear SET asset_no = ?, serial = ?, purchased_on = ?, purchased_from = ?, current_version = ?, note = ? WHERE id = ?')
    .bind(f.asset_no, f.serial, f.purchased_on, f.purchased_from, f.current_version, f.note, g.id).run();
  return c.json({ ok: true });
});

app.delete('/api/gear/:id', async c => {
  const g = await ownGear(c, c.req.param('id'));
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM gear_updates WHERE gear_id = ?').bind(g.id),
    c.env.DB.prepare('DELETE FROM gear WHERE id = ?').bind(g.id),
  ]);
  return c.json({ ok: true });
});

// 更新したことを記録する
app.post('/api/gear/:id/updates', async c => {
  const g = await ownGear(c, c.req.param('id'));
  const b = await body(c);
  const to = str(b.to_version, '新しいバージョン', 40);
  if (!to) throw new HttpError(400, '新しいバージョンを入れてください。');
  const on = date(b.updated_on, '更新した日') ?? new Date(now() + 9 * 3600_000).toISOString().slice(0, 10);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO gear_updates (id, gear_id, from_version, to_version, updated_on, recorded_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(randomId(), g.id, g.current_version, to, on, await nameOf(c), str(b.note, 'メモ', 200), now()),
    c.env.DB.prepare('UPDATE gear SET current_version = ?, last_updated_on = ? WHERE id = ?').bind(to, on, g.id),
  ]);
  return c.json({ ok: true });
});

// 書き出し用：すべての更新の記録
app.get('/api/updates', async c => {
  const rows = await c.env.DB.prepare(`SELECT u.*, g.asset_no, COALESCE(m.maker, g.custom_maker) AS maker, COALESCE(m.model, g.custom_model) AS model
    FROM gear_updates u JOIN gear g ON g.id = u.gear_id LEFT JOIN models m ON m.id = g.model_id WHERE g.user_id = ? ORDER BY u.updated_on DESC, u.created_at DESC`).bind(c.get('userId')).all();
  return c.json({ updates: rows.results });
});

// 機種の詳細：公開されたバージョンと手持ちの台
app.get('/api/models/:id', async c => {
  const m = await c.env.DB.prepare('SELECT m.*, s.label AS source_label, s.page_url, s.ok AS source_ok, s.checked_at FROM models m LEFT JOIN sources s ON s.key = m.source_key WHERE m.id = ?').bind(Number(c.req.param('id'))).first<any>();
  if (!m) throw new HttpError(404, '機種が見つかりません。');
  const releases = m.source_key ? (await c.env.DB.prepare('SELECT version, title, released_at, notes, url, severity FROM releases WHERE source_key = ?').bind(m.source_key).all<any>()).results.sort((a, b) => compareVersions(b.version, a.version)) : [];
  const latest = await latestBySource(c.env);
  const units = (await c.env.DB.prepare(`${GEAR_SQL} WHERE g.user_id = ? AND g.model_id = ? ORDER BY g.asset_no`).bind(c.get('userId'), m.id).all<any>()).results.map(r => shapeGear(r, latest));
  return c.json({ model: { id: m.id, maker: m.maker, model: m.model, sub: m.sub, maker_url: m.maker_url, source_key: m.source_key, source_label: m.source_label, page_url: m.page_url, source_ok: m.source_ok, checked_at: m.checked_at }, releases, units });
});

// ---- 更新の一覧（通知） ----
app.get('/api/alerts', async c => {
  const uid = c.get('userId');
  const rows = (await c.env.DB.prepare(`SELECT a.id, a.severity, a.created_at, a.read_at, r.source_key, r.version, r.title, r.notes, r.url, r.released_at, s.label AS source_label
    FROM alerts a JOIN releases r ON r.id = a.release_id JOIN sources s ON s.key = r.source_key WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 200`).bind(uid).all<any>()).results;
  const gear = (await c.env.DB.prepare('SELECT g.current_version, m.source_key, m.control_sw, COALESCE(m.model, g.custom_model) AS model FROM gear g LEFT JOIN models m ON m.id = g.model_id WHERE g.user_id = ?').bind(uid).all<any>()).results;
  const alerts = rows.map(a => {
    const isOs = a.source_key.startsWith('os:');
    const mine = gear.filter(g => (isOs ? g.control_sw === 1 : g.source_key === a.source_key));
    const behind = mine.filter(g => g.current_version && compareVersions(g.current_version, a.version) < 0);
    return { ...a, is_os: isOs, units: mine.length, models: [...new Set(mine.map(g => g.model))].slice(0, 3), from: behind[0]?.current_version ?? null };
  });
  return c.json({ alerts });
});
app.post('/api/alerts/:id/read', async c => {
  await c.env.DB.prepare('UPDATE alerts SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL').bind(now(), c.req.param('id'), c.get('userId')).run();
  return c.json({ ok: true });
});
app.post('/api/alerts/read-all', async c => {
  const b = await body(c);
  const sev = b.severity === 'later' ? 'later' : 'now';
  await c.env.DB.prepare('UPDATE alerts SET read_at = ? WHERE user_id = ? AND severity = ? AND read_at IS NULL').bind(now(), c.get('userId'), sev).run();
  return c.json({ ok: true });
});

// ---- 定期チェックからの受け口（GitHub Actions） ----
async function internalAuth(c: any) {
  const tok = c.req.header('Authorization')?.replace(/^Bearer /, '') ?? '';
  // 本番：GitHub Actions が発行した証明で確かめる（人が鍵を作って入れなくてよい）
  if (tok.split('.').length === 3) { await verifyGithubOidc(tok, c.env.GITHUB_REPOSITORY); return; }
  // ローカルの試験：INTERNAL_TOKEN が入っているときだけ
  const want = c.env.INTERNAL_TOKEN ?? '';
  if (!want || want.length < 32 || tok.length !== want.length) throw new HttpError(401, '鍵が違います。');
  const a = new TextEncoder().encode(tok), b = new TextEncoder().encode(want);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff) throw new HttpError(401, '鍵が違います。');
}
app.post('/internal/ingest', async c => {
  await internalAuth(c);
  const b = await body(c);
  const r = await ingest(c.env, Array.isArray(b.checked) ? b.checked : []);
  // 通知を送るための鍵も渡す（送るのは GitHub Actions 側）
  return c.json({ ...r, vapid: await vapid(c.env) });
});
app.post('/internal/push-result', async c => {
  await internalAuth(c);
  const b = await body(c);
  await pushResult(c.env, Array.isArray(b.gone) ? b.gone.map(String) : []);
  return c.json({ ok: true });
});
app.get('/internal/sources', async c => {
  await internalAuth(c);
  return c.json((await c.env.DB.prepare('SELECT key, page_url, checked_at FROM sources').all()).results);
});

app.all('/api/*', c => c.json({ error: 'ありません。' }, 404));

export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const p = new URL(req.url).pathname;
    if (p.startsWith('/api/') || p.startsWith('/internal/')) return app.fetch(req, env, ctx);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
