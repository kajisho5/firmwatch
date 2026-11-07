// 通しの試験：wrangler dev（DEV_AUTH=1）で動いているサーバーに対して流す
// 使い方：node test/e2e.mjs [http://127.0.0.1:8787]  環境変数 INTERNAL_TOKEN に .dev.vars と同じ値
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseBlackmagic, parseAppleRss } from '../checker/adapters.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const TOKEN = process.env.INTERNAL_TOKEN;
assert.ok(TOKEN, 'INTERNAL_TOKEN を設定してください');
const sources = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8')).sources;
const fx = n => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const run = Date.now().toString(36);

function client() {
  let cookie = '';
  return async (path, { method, body, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method: method ?? (body !== undefined ? 'POST' : 'GET'),
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), Origin: BASE, Cookie: cookie, ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}
const internal = (path, body, token = TOKEN) => fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, data: await r.json() }));

let n = 0;
const ok = (name) => console.log(`  ✓ ${++n}. ${name}`);

const a = client(), b = client();

assert.equal((await a('/api/me')).status, 401); ok('ログイン前は読めない');
assert.equal((await a('/api/dev/login', { body: { id: 'a' + run, name: 'テスト太郎' } })).status, 200);
assert.equal((await a('/api/me')).data.user.name, 'テスト太郎'); ok('開発用ログイン');

// 守り
assert.equal((await a('/api/gear', { method: 'POST', body: undefined, headers: { 'Content-Type': 'text/plain' } })).status, 415); ok('JSON 以外の書き込みは断る');
assert.equal((await a('/api/gear', { body: {}, headers: { Origin: 'https://evil.example' } })).status, 403); ok('よそのサイトからの書き込みは断る');
assert.equal((await internal('/internal/ingest', { checked: [] }, 'x'.repeat(64))).status, 401); ok('定期チェックの鍵が違えば断る');

// 機種を探して追加
const hit = (await a('/api/models?q=ATEM Mini Pro')).data.models.find(m => m.model === 'ATEM Mini Pro');
assert.ok(hit && hit.source_key === 'bmd:atem:ATEM Switchers'); ok('機種を探せる（ATEM Mini Pro → ATEM Switchers）');
const add = await a('/api/gear', { body: { model_id: hit.id, count: 2, current_version: '10.1.2', purchased_on: '2024-04-10' } });
assert.equal(add.data.ids.length, 2); ok('2台まとめて追加');
const roland = (await a('/api/models?q=V-160HD')).data.models.find(m => m.model === 'V-160HD');
assert.ok(roland && roland.source_key === null); ok('Roland は自動確認なし');
await a('/api/gear', { body: { model_id: roland.id, asset_no: 'R-01', current_version: '3.5' } });
const custom = await a('/api/gear', { body: { custom_maker: 'サンプル電機', custom_model: 'テスト機 100' } });
assert.equal(custom.status, 200); ok('一覧にない機種を手で追加');
assert.equal((await a('/api/gear', { body: { purchased_on: '2024/4/10', model_id: hit.id } })).status, 400); ok('日付の形が違えば断る');

// 通知先（ダミー）
await a('/api/push/subscribe', { body: { endpoint: `https://push.example.invalid/${run}`, keys: { p256dh: 'BPx', auth: 'au' }, label: 'iPhone' } });

// 1回目の取り込み（初回は通知しない）
const bmd = parseBlackmagic(JSON.parse(fx('bmd-downloads.json')), sources.filter(s => s.key.startsWith('bmd:')));
const atem = bmd['bmd:atem:ATEM Switchers'];
const first = await internal('/internal/ingest', { checked: [{ key: 'bmd:atem:ATEM Switchers', ok: true, releases: atem.slice(1) }] });
assert.equal(first.status, 200);
let alerts = (await a('/api/alerts')).data.alerts;
assert.equal(alerts.filter(x => x.source_key === 'bmd:atem:ATEM Switchers').length, 0); ok('初回の取り込みでは通知しない');

let gear = (await a('/api/gear')).data.gear;
const units = gear.filter(g => g.model_id === hit.id);
assert.equal(units[0].latest.version, atem[1].version);
assert.equal(units[0].state, 'old'); ok(`手元 10.1.2 は古い（最新 ${atem[1].version}）`);
assert.equal(gear.find(g => g.model_id === roland.id).state, 'manual'); ok('自動確認なしの台は manual');

// 2回目：新しいバージョンが出た
const second = await internal('/internal/ingest', { checked: [{ key: 'bmd:atem:ATEM Switchers', ok: true, releases: atem }] });
assert.equal(second.data.summary['bmd:atem:ATEM Switchers'].added, 1);
alerts = (await a('/api/alerts')).data.alerts;
const al = alerts.find(x => x.version === atem[0].version);
assert.ok(al); assert.equal(al.units, 2); assert.equal(al.from, '10.1.2'); ok(`新しいバージョン ${atem[0].version} を通知（2台分）`);
const sev = al.severity;
if (sev === 'now') { assert.ok(second.data.pushes.some(p => p.endpoint.endsWith(run))); ok('確認が要る更新はすぐ送る'); }
else { assert.ok(!second.data.pushes.some(p => p.endpoint.endsWith(run))); ok('あとで見る更新はすぐには送らない'); }

// 同じ内容をもう一度：重ねて通知しない
const third = await internal('/internal/ingest', { checked: [{ key: 'bmd:atem:ATEM Switchers', ok: true, releases: atem }] });
assert.equal(third.data.summary['bmd:atem:ATEM Switchers'].added, 0); ok('同じバージョンで重ねて通知しない');

// 一度に何件も出たときは、いちばん新しい1件だけ通知
const cv = (await a('/api/models?q=Micro Converter SDI to HDMI 12G')).data.models[0];
await a('/api/gear', { body: { model_id: cv.id } });
const conv = bmd['bmd:converters:Blackmagic Converters'];
await internal('/internal/ingest', { checked: [{ key: 'bmd:converters:Blackmagic Converters', ok: true, releases: conv.slice(3) }] });
await internal('/internal/ingest', { checked: [{ key: 'bmd:converters:Blackmagic Converters', ok: true, releases: conv }] });
const convAlerts = (await a('/api/alerts')).data.alerts.filter(x => x.source_key === 'bmd:converters:Blackmagic Converters');
assert.equal(convAlerts.length, 1); assert.equal(convAlerts[0].version, conv[0].version); ok('一度に3件出ても、通知は最新の1件だけ');

// 古い系列の更新は通知しない
await internal('/internal/ingest', { checked: [{ key: 'bmd:atem:ATEM Switchers', ok: true, releases: [{ version: '9.9.9', title: '古い系列', released_at: Date.now(), notes: '修正', url: 'https://example.invalid', severity: 'now' }] }] });
alerts = (await a('/api/alerts')).data.alerts;
assert.ok(!alerts.some(x => x.version === '9.9.9')); ok('古い系列の更新は通知しない');

// OS：操作ソフトを使う機材（スイッチャー）があるので通知
const mac = parseAppleRss(fx('apple-releases.rss'))['os:macos'];
await internal('/internal/ingest', { checked: [{ key: 'os:macos', ok: true, releases: mac.slice(1) }] });
await internal('/internal/ingest', { checked: [{ key: 'os:macos', ok: true, releases: mac }] });
alerts = (await a('/api/alerts')).data.alerts;
const os = alerts.find(x => x.source_key === 'os:macos');
assert.ok(os && os.is_os && os.severity === 'now' && os.units === 4); ok(`macOS ${mac[0].version} を通知（操作ソフトを使う機材 4台）`);

// 確認済みにする
await a(`/api/alerts/${os.id}/read`, { body: {} });
assert.ok((await a('/api/alerts')).data.alerts.find(x => x.id === os.id).read_at); ok('確認済みにできる');

// 更新を記録する
const u0 = units[0].id;
assert.equal((await a(`/api/gear/${u0}/updates`, { body: { to_version: atem[0].version, updated_on: '2026-11-07' } })).status, 200);
const d = (await a(`/api/gear/${u0}`)).data;
assert.equal(d.gear.current_version, atem[0].version); assert.equal(d.gear.state, 'ok'); assert.equal(d.gear.last_updated_on, '2026-11-07');
assert.equal(d.updates[0].from_version, '10.1.2'); assert.equal(d.updates[0].recorded_by, 'テスト太郎'); ok('更新を記録すると今のバージョンも変わる');

// 台帳を直す
await a(`/api/gear/${u0}`, { method: 'PATCH', body: { asset_no: 'A-01', serial: 'SAMPLE-0001', purchased_from: 'サンプル機材店' } });
assert.equal((await a(`/api/gear/${u0}`)).data.gear.asset_no, 'A-01'); ok('台帳を直せる');

// 機種の詳細
const md = (await a(`/api/models/${hit.id}`)).data;
assert.equal(md.units.length, 2); assert.equal(md.releases[0].version, atem[0].version); ok('機種の詳細に手持ちと公開バージョン');

// 書き出し用の記録
const ups = (await a('/api/updates')).data.updates;
assert.ok(ups.length >= 4 && ups.every(x => x.model)); ok(`書き出し用の更新記録 ${ups.length}件`);

// あとで見るのまとめ通知：今の曜日・時刻に合わせる
const jst = new Date(Date.now() + 9 * 3600e3);
await internal('/internal/ingest', { checked: [{ key: 'bmd:hyperdeck:HyperDeck', ok: true, releases: [{ version: '1.0', title: 'x', released_at: 1, notes: '', url: 'https://example.invalid', severity: 'later' }] }] });
const hd = (await a('/api/models?q=HyperDeck Studio HD Mini')).data.models[0];
await a('/api/gear', { body: { model_id: hd.id } });
await internal('/internal/ingest', { checked: [{ key: 'bmd:hyperdeck:HyperDeck', ok: true, releases: [{ version: '2.0', title: 'HyperDeck 2.0', released_at: 2, notes: '性能を向上', url: 'https://example.invalid', severity: 'later' }] }] });
await a('/api/me', { method: 'PATCH', body: { digest_weekday: jst.getUTCDay(), digest_hour: 0 } });
const dg = await internal('/internal/ingest', { checked: [] });
assert.ok(dg.data.pushes.some(p => p.endpoint.endsWith(run) && p.payload.tag === 'later')); ok('あとで見る更新は決めた曜日にまとめて送る');
const dg2 = await internal('/internal/ingest', { checked: [] });
assert.ok(!dg2.data.pushes.some(p => p.endpoint.endsWith(run))); ok('まとめ通知は1日1回だけ');

// 読み取れなかった取得先
await internal('/internal/ingest', { checked: [{ key: 'bmd:hyperdeck:HyperDeck', ok: false, error: 'テスト' }] });
assert.equal((await a('/api/gear')).data.gear.find(g => g.model_id === hd.id).state, 'stopped'); ok('読み取れないと「確認が止まっている」になる');

// 使われなくなった通知先は消す
await internal('/internal/push-result', { gone: [`https://push.example.invalid/${run}`] });
assert.equal((await a('/api/me')).data.pushSubs.length, 0); ok('使われなくなった通知先を消す');

// 別の人からは見えない
await b('/api/dev/login', { body: { id: 'b' + run, name: 'テスト花子' } });
assert.equal((await b(`/api/gear/${u0}`)).status, 404);
assert.equal((await b('/api/gear')).data.gear.length, 0);
assert.equal((await b('/api/alerts')).data.alerts.length, 0); ok('ほかの人の機材・通知は見えない');

// 消す
assert.equal((await a(`/api/gear/${u0}`, { method: 'DELETE' })).status, 200);
assert.equal((await a(`/api/gear/${u0}`)).status, 404); ok('台を消せる');

await a('/api/auth/logout', { body: {} });
assert.equal((await a('/api/me')).status, 401); ok('ログアウト');
console.log(`通しの試験 ${n} 件、すべて通りました`);
