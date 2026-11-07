// 機材を追加：ジャンル・メーカーからたどって選ぶ画面の試験（iPhone の大きさ）
// 使い方：node test/browse.mjs <サーバーURL> [画面を撮るフォルダ]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8788';
const SHOTS = process.argv[3];
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const ok = s => console.log('  ✓', s);
const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png` }); };

await page.goto(BASE + '/');
await page.evaluate(() => fetch('/api/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'browse-test', name: 'テスト次郎' }) }));
await page.goto(BASE + '/add');

// B1 ジャンルから
await page.waitForSelector('button:has-text("映像")');
assert.ok(await page.isVisible('text=スイッチャー、') || await page.isVisible('text=モニター・ディスプレイ、')); ok('ジャンルの一覧（種類の例つき）');
await shot('b1-genre');

// B2 ジャンルの中
await page.click('button:has-text("映像")');
await page.waitForSelector('h1:has-text("映像")');
await page.waitForSelector('button:has-text("スイッチャー")');
ok('ジャンルを押すと種類の一覧');
await shot('b2-subs');

// B3 種類の中・メーカーで絞る
await page.click('button:has-text("スイッチャー")');
await page.waitForSelector('h1:has-text("スイッチャー")');
await page.waitForSelector('text=/[0-9,]+機種/');
await page.click('button[aria-pressed]:has-text("Roland")');
await page.waitForFunction(() => location.search.includes('f=Roland'));
const heads = await page.$$eval('h2', hs => hs.map(h => h.textContent));
assert.ok(heads.length === 1 && heads[0].startsWith('Roland')); ok('メーカーで絞れる');
await shot('b3-list');
await page.fill('input[aria-label="スイッチャーの中で探す"]', 'v-160');
await page.waitForSelector('button:has-text("V-160HD")');
const rows = await page.$$eval('section button span:first-child', b => b.map(x => x.textContent));
assert.ok(rows.length >= 1 && rows.every(t => /160/.test(t)), rows.join(',')); ok('種類の中で探せる');
await page.click('section button:has-text("V-160HD") >> nth=0');
await page.waitForSelector('text=台数');
assert.ok(await page.isVisible('text=V-160HD')); ok('機種を選ぶと入力に進む');
await page.click('text=一覧に戻る');
await page.waitForSelector('h1:has-text("スイッチャー")'); ok('選び直しで一覧に戻る');

// 戻るで1段ずつ戻る
await page.goBack(); await page.waitForSelector('h1:has-text("映像")');
await page.goBack(); await page.waitForSelector('h1:has-text("機材を追加")');
ok('戻るで1段ずつ戻れる');

// B4 メーカーから
await page.click('role=tab[name="メーカーから"]');
await page.waitForSelector('text=日本語のメーカー', { state: 'attached' });
await shot('b4-makers');
const before = await page.evaluate(() => scrollY);
const bar = page.locator('main div.fixed');
const box = await bar.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height - 5); // 索引のいちばん下（日本語）
await page.waitForFunction(b => scrollY > b + 1000, before);
ok('索引を押すと飛べる');
await page.click('button:has-text("Roland") >> nth=0');
await page.waitForSelector('h1:has-text("Roland")');
await page.waitForSelector('text=種類で絞る');
await page.click('button[aria-pressed]:has-text("スイッチャー")');
await page.waitForFunction(() => location.search.includes('f='));
const h2 = await page.$$eval('h2', hs => hs.map(h => h.textContent));
assert.ok(h2.length === 1 && h2[0].startsWith('スイッチャー')); ok('メーカーの中を種類で絞れる');
await shot('b5-maker');

assert.deepEqual(errors, []);
await browser.close();
console.log('ジャンル・メーカーから選ぶ試験、すべて通りました');
