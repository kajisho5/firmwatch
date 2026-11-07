// 定期チェック（GitHub Actions）から呼ばれる処理：取得した最新バージョンを保存し、通知を作り、送る通知の一覧を返す
import { compareVersions } from '../../shared/version.js';
import { Env, now, randomId } from './util';

export interface CheckedRelease { version: string; title: string; released_at: number | null; notes: string; url: string; severity: 'now' | 'later' }
export interface Checked { key: string; ok: boolean; error?: string; releases?: CheckedRelease[] }
export interface PushJob { endpoint: string; p256dh: string; auth: string; payload: { title: string; body: string; url: string; tag: string } }

const OS_FLAG: Record<string, string> = { 'os:macos': 'os_macos', 'os:windows': 'os_windows', 'os:ipados': 'os_ipados' };

/** 日本時間の曜日と時 */
function jst(t: number) {
  const d = new Date(t + 9 * 3600_000);
  return { weekday: d.getUTCDay(), hour: d.getUTCHours(), dayStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 9 * 3600_000 };
}

export async function ingest(env: Env, checked: Checked[], t = now()) {
  const db = env.DB;
  const summary: Record<string, { added: number; alerted: number }> = {};
  for (const s of checked) {
    const src = await db.prepare('SELECT key, baseline_done FROM sources WHERE key = ?').bind(s.key).first<{ key: string; baseline_done: number }>();
    if (!src) continue;
    await db.prepare('UPDATE sources SET checked_at = ?, ok = ?, error = ? WHERE key = ?').bind(t, s.ok ? 1 : 0, s.ok ? null : (s.error ?? '読み取れませんでした').slice(0, 300), s.key).run();
    if (!s.ok || !s.releases?.length) continue;
    const known = (await db.prepare('SELECT version FROM releases WHERE source_key = ?').bind(s.key).all<{ version: string }>()).results.map(r => r.version);
    const prevMax = known.reduce<string | null>((m, v) => (m == null || compareVersions(v, m) > 0 ? v : m), null);
    const fresh = s.releases.filter(r => !known.includes(r.version));
    // 一度に何件も見つかったときは、いちばん新しい1件だけを通知する
    const newest = fresh.reduce<CheckedRelease | null>((m, r) => (m == null || compareVersions(r.version, m.version) > 0 ? r : m), null);
    let alerted = 0;
    for (const r of fresh) {
      const ins = await db.prepare('INSERT INTO releases (source_key, version, title, released_at, notes, url, severity, found_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id')
        .bind(s.key, r.version, r.title, r.released_at, r.notes, r.url, r.severity, t).first<{ id: number }>();
      if (!ins || !src.baseline_done) continue;
      if (r !== newest) continue;
      if (prevMax != null && compareVersions(r.version, prevMax) <= 0) continue; // 古い系列の更新は通知しない
      const users = OS_FLAG[s.key]
        ? await db.prepare(`SELECT DISTINCT u.id FROM users u JOIN gear g ON g.user_id = u.id JOIN models m ON m.id = g.model_id WHERE m.control_sw = 1 AND u.${OS_FLAG[s.key]} = 1`).all<{ id: string }>()
        : await db.prepare('SELECT DISTINCT g.user_id AS id FROM gear g JOIN models m ON m.id = g.model_id WHERE m.source_key = ?').bind(s.key).all<{ id: string }>();
      for (const u of users.results) {
        await db.prepare('INSERT INTO alerts (id, user_id, release_id, severity, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(randomId(), u.id, ins.id, r.severity, t).run();
        alerted++;
      }
    }
    if (!src.baseline_done) await db.prepare('UPDATE sources SET baseline_done = 1 WHERE key = ?').bind(s.key).run();
    summary[s.key] = { added: fresh.length, alerted };
  }
  const pushes = await buildPushes(env, t);
  return { summary, pushes };
}

async function buildPushes(env: Env, t: number): Promise<PushJob[]> {
  const db = env.DB;
  const jobs: PushJob[] = [];
  const subsOf = async (userId: string) => (await db.prepare('SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?').bind(userId).all<{ endpoint: string; p256dh: string; auth: string }>()).results;

  // 確認が要る更新：すぐ
  const nowRows = (await db.prepare(`SELECT a.user_id, COUNT(*) AS n, MIN(r.title) AS title FROM alerts a JOIN releases r ON r.id = a.release_id
    WHERE a.severity = 'now' AND a.pushed_at IS NULL AND a.read_at IS NULL GROUP BY a.user_id`).all<{ user_id: string; n: number; title: string }>()).results;
  for (const row of nowRows) {
    const body = row.n === 1 ? `${row.title} が出ました。上げる前に内容を確かめてください。` : `${row.title} など ${row.n} 件の更新が出ました。`;
    for (const s of await subsOf(row.user_id)) jobs.push({ ...s, payload: { title: '確認が要る更新', body, url: '/', tag: 'now' } });
    await db.prepare("UPDATE alerts SET pushed_at = ? WHERE user_id = ? AND severity = 'now' AND pushed_at IS NULL").bind(t, row.user_id).run();
  }

  // あとで見る更新：利用者が決めた曜日・時刻に、まとめて
  const { weekday, hour, dayStart } = jst(t);
  const due = (await db.prepare('SELECT id, digest_hour FROM users WHERE digest_weekday = ? AND digest_hour <= ? AND (last_digest_at IS NULL OR last_digest_at < ?)')
    .bind(weekday, hour, dayStart).all<{ id: string; digest_hour: number }>()).results;
  for (const u of due) {
    const r = await db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND severity = 'later' AND pushed_at IS NULL AND read_at IS NULL").bind(u.id).first<{ n: number }>();
    if (r && r.n > 0) {
      for (const s of await subsOf(u.id)) jobs.push({ ...s, payload: { title: 'あとで見る更新のまとめ', body: `${r.n} 件の更新があります。`, url: '/?tab=later', tag: 'later' } });
      await db.prepare("UPDATE alerts SET pushed_at = ? WHERE user_id = ? AND severity = 'later' AND pushed_at IS NULL").bind(t, u.id).run();
    }
    await db.prepare('UPDATE users SET last_digest_at = ? WHERE id = ?').bind(t, u.id).run();
  }
  return jobs;
}

/** 送れなかった（もう使われていない）通知先を消す */
export async function pushResult(env: Env, gone: string[]) {
  for (const e of gone.slice(0, 500)) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(e).run();
}
