// 定期チェック：メーカー・OS の公開情報を読み、FIRMWATCH に渡し、返ってきた通知を送る
// 使い方：node checker/run.mjs            … 取得してから通知
//        node checker/run.mjs --digest   … 取得はせず、まとめ通知の時刻になった人にだけ送る
// 必要な環境変数：FIRMWATCH_URL。本人確認は GitHub Actions の証明（OIDC）で行う。
// ローカルで試すときだけ FIRMWATCH_INTERNAL_TOKEN を使う。通知用の鍵はサーバーから受け取る
//
// 各サイトの robots.txt は 2026-11-07 に確認済み：
//   Blackmagic Design の /api/support/ は禁止されていない（crawl-delay: 1）
//   developer.apple.com の /news/releases/rss/ は禁止されていない
//   learn.microsoft.com の release-health は禁止されていない
//   Roland（proav.roland.com）は /support/ が禁止されているので読まない
// 製品ページの見張り（pagewatch.mjs）は、読む前にそのサイトの robots.txt を毎回確かめる
import { readFileSync } from 'node:fs';
import * as webpush from 'web-push';
import { parseBlackmagic, parseAppleRss, parseWindows } from './adapters.mjs';
import { watchPages, decodeHtml } from './pagewatch.mjs';

const UA = 'FIRMWATCH/0.1 (+https://github.com/kajisho5/firmwatch)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, type = 'text') {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url} が ${res.status} を返しました`);
  return type === 'json' ? res.json() : res.text();
}

export async function collect() {
  const { sources } = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'));
  const checked = [];
  const put = (keys, fn) => async () => {
    try {
      const map = await fn();
      for (const k of keys) {
        const rel = map[k] || [];
        checked.push(rel.length ? { key: k, ok: true, releases: rel } : { key: k, ok: false, error: '公開情報の中にこの製品が見つかりませんでした' });
      }
    } catch (e) {
      for (const k of keys) checked.push({ key: k, ok: false, error: String(e.message || e).slice(0, 300) });
    }
  };
  const bmd = sources.filter(s => s.key.startsWith('bmd:'));
  await put(bmd.map(s => s.key), async () => parseBlackmagic(await get('https://www.blackmagicdesign.com/api/support/jp/downloads.json', 'json'), bmd))();
  await sleep(1100);
  await put(['os:macos', 'os:ipados'], async () => parseAppleRss(await get('https://developer.apple.com/news/releases/rss/releases.rss')))();
  await sleep(1100);
  await put(['os:windows'], async () => parseWindows(await get('https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information')))();
  return checked;
}

/** GitHub Actions の証明（OIDC）を取る。ローカルでは FIRMWATCH_INTERNAL_TOKEN を使う */
async function authToken() {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: rt, FIRMWATCH_INTERNAL_TOKEN: local } = process.env;
  if (url && rt) {
    const r = await fetch(`${url}&audience=firmwatch`, { headers: { Authorization: `Bearer ${rt}` } });
    if (!r.ok) throw new Error(`GitHub の証明を取れませんでした（${r.status}）。ワークフローに id-token: write があるか確かめてください`);
    return (await r.json()).value;
  }
  if (local) return local;
  throw new Error('GitHub Actions の外では FIRMWATCH_INTERNAL_TOKEN を設定してください');
}

async function main() {
  const base = process.env.FIRMWATCH_URL?.replace(/\/$/, '');
  if (!base) throw new Error('FIRMWATCH_URL を設定してください');
  const token = await authToken();
  const digestOnly = process.argv.includes('--digest');
  const checked = digestOnly ? [] : await collect();
  if (!digestOnly) {
    // 汎用の見張り：登録された機種のうち、専用の読み取りがないものの製品ページ
    const wl = await fetch(`${base}/internal/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    if (wl.ok) {
      const { watch } = await wl.json();
      console.log(`製品ページの見張り：${watch.length} 機種`);
      checked.push(...await watchPages(watch, async url => {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
        return { status: r.status, text: r.status === 200 ? decodeHtml(await r.arrayBuffer(), r.headers.get('content-type') || '') : '' };
      }));
    } else console.log(`見張りの一覧を受け取れませんでした（${wl.status}）`);
  }
  for (const c of checked) console.log(c.ok ? `OK   ${c.key}  最新 ${c.releases[0].version}` : `失敗 ${c.key}  ${c.error}`);

  const res = await fetch(`${base}/internal/ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ checked }),
  });
  if (!res.ok) throw new Error(`FIRMWATCH への送信に失敗しました（${res.status}）：${await res.text()}`);
  const { summary, pushes, vapid } = await res.json();
  for (const [k, v] of Object.entries(summary)) if (v.added) console.log(`新しいバージョン ${k}：${v.added} 件（通知 ${v.alerted} 件）`);

  if (!pushes.length) return console.log('送る通知はありません');
  if (!vapid?.publicKey || !vapid?.privateKey) throw new Error('通知用の鍵を受け取れませんでした');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://github.com/kajisho5/firmwatch', vapid.publicKey, vapid.privateKey);
  const gone = [];
  let sent = 0;
  for (const p of pushes) {
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify(p.payload), { TTL: 86400, urgency: p.payload.tag === 'now' ? 'high' : 'normal' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(p.endpoint);
      else console.log(`通知を送れませんでした（${e.statusCode ?? ''}）`);
    }
  }
  console.log(`通知を ${sent} 件送りました。使われなくなった通知先 ${gone.length} 件`);
  if (gone.length) await fetch(`${base}/internal/push-result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ gone }),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error(e.message || e); process.exit(1); });
}
