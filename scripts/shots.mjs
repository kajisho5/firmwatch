// 画面の確認用：架空のデータを入れて、iPhone の大きさで各画面を撮る
// 使い方：node scripts/shots.mjs <サーバーURL> <出力フォルダ>（INTERNAL_TOKEN が必要。DEV_AUTH=1 のサーバーに対して）
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { parseBlackmagic, parseAppleRss } from '../checker/adapters.mjs';

const [BASE = 'http://127.0.0.1:8791', OUT = '/tmp/shots'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const TOKEN = process.env.INTERNAL_TOKEN;
const sources = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8')).sources;
const fx = n => readFileSync(new URL(`../test/fixtures/${n}`, import.meta.url), 'utf8');
const ingest = checked => fetch(BASE + '/internal/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ checked }) }).then(r => r.json());

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// ログイン前
await page.goto(BASE + '/');
await page.waitForSelector('text=FIRMWATCH');
await page.screenshot({ path: `${OUT}/s0-start.png` });

const api = (path, body, method) => page.evaluate(async ([p, b, m]) => {
  const r = await fetch(p, { method: m ?? (b !== undefined ? 'POST' : 'GET'), headers: b !== undefined ? { 'Content-Type': 'application/json' } : {}, body: b !== undefined ? JSON.stringify(b) : undefined });
  return r.json();
}, [path, body, method]);

await api('/api/dev/login', { id: 'demo', name: 'テスト太郎' });
const find = async q => (await api(`/api/models?q=${encodeURIComponent(q)}`)).models.find(m => m.model === q);

// 取得先の1回目（ひとつ前の状態）
const bmd = parseBlackmagic(JSON.parse(fx('bmd-downloads.json')), sources.filter(s => s.key.startsWith('bmd:')));
const mac = parseAppleRss(fx('apple-releases.rss'))['os:macos'];
const keys = ['bmd:atem:ATEM Switchers', 'bmd:hyperdeck:HyperDeck', 'bmd:converters:Blackmagic Converters'];
await ingest([...keys.map(k => ({ key: k, ok: true, releases: bmd[k].slice(1) })), { key: 'os:macos', ok: true, releases: mac.slice(1) }]);

const atem = await find('ATEM Mini Pro');
const [a1, a2] = (await api('/api/gear', { model_id: atem.id, count: 2, current_version: bmd[keys[0]][2].version, purchased_on: '2024-04-10' })).ids;
await api(`/api/gear/${a1}`, { asset_no: 'A-01', serial: 'SAMPLE-0001', purchased_from: 'サンプル機材店', note: '予備機。ケースBに収納' }, 'PATCH');
await api(`/api/gear/${a2}`, { asset_no: 'A-02', purchased_on: '2025-09-01' }, 'PATCH');
await api(`/api/gear/${a1}/updates`, { to_version: bmd[keys[0]][1].version, updated_on: '2026-08-21' });
await api('/api/gear', { model_id: (await find('ATEM Television Studio HD8')).id, asset_no: 'A-10', current_version: bmd[keys[0]][1].version });
await api('/api/gear', { model_id: (await find('HyperDeck Studio HD Mini')).id, asset_no: 'H-01', current_version: bmd[keys[1]][1].version });
await api('/api/gear', { model_id: (await find('V-160HD')).id, asset_no: 'R-01', current_version: '3.60' });
await api('/api/gear', { model_id: (await find('VR-6HD')).id, asset_no: 'R-02' });

// 2回目：新しいバージョンが出た
await ingest([...keys.map(k => ({ key: k, ok: true, releases: bmd[k] })), { key: 'os:macos', ok: true, releases: mac }]);

const shot = async (path, name, prep) => {
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
  if (prep) await prep();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
await shot('/', 's1-updates');
await shot('/?tab=later', 's1-later');
await shot('/gear', 's2-gear');
await shot(`/models/${atem.id}`, 's4-model');
await shot(`/models/${atem.id}`, 's4-model-full', async () => { await page.setViewportSize({ width: 390, height: 1300 }); });
await page.setViewportSize({ width: 390, height: 844 });
await shot(`/gear/${a1}`, 's8-unit');
await shot(`/gear/${a1}`, 's8-record', async () => { await page.click('text=更新したことを記録する'); });
await shot('/add', 's3-add', async () => { await page.fill('input[aria-label="機種を探す"]', 'ATEM Mini'); await page.waitForSelector('text=ATEM Mini Pro'); });
await shot('/add', 's3-add-picked', async () => { await page.fill('input[aria-label="機種を探す"]', 'ATEM Mini'); await page.click('button:has-text("ATEM Mini Pro ISO")'); });
await shot('/export', 's7-export');
await shot('/settings', 's6-settings');
await shot('/settings', 's6-settings-full', async () => { await page.setViewportSize({ width: 390, height: 1150 }); });

// 書き出しファイルを実際に作る（ダウンロードとして受け取る）
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + '/export');
await page.waitForLoadState('networkidle');
await page.evaluate(() => { (navigator).canShare = () => false; });
const [xl] = await Promise.all([page.waitForEvent('download'), page.click('text=書き出して保存する')]);
await xl.saveAs(`${OUT}/${xl.suggestedFilename()}`);
await page.click('button[role="radio"]:has-text("CSV")');
const dl = [];
page.on('download', d => dl.push(d));
await page.click('text=書き出して保存する');
await page.waitForTimeout(2000);
for (const d of dl) await d.saveAs(`${OUT}/${d.suggestedFilename()}`);
console.log(`CSV ${dl.length} 件：${dl.map(d => d.suggestedFilename()).join('、')}`);

console.log(errors.length ? '画面のエラー:\n' + errors.join('\n') : '画面のエラーなし');
await browser.close();
