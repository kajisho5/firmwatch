// 新しい版への切り替えの試験：古い版を開いたまま新しい版を公開し、
// 入力していないときは自動で切り替わり、入力中は案内を出してボタンで切り替わることを確かめる
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8788';
const exe = existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: exe ? ['--headless=new'] : [] });
const page = await (await browser.newContext()).newPage();
const build = () => page.evaluate(() => window.__FW_BUILD__);
/** 読み込み直しをまたいで、画面の版が v になるのを待つ */
async function waitBuild(v, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await build()) === v) return; } catch { /* 読み込み直しの途中 */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`版が ${v} に切り替わりませんでした（今は ${await build().catch(() => '?')}）`);
}
const served = async () => { try { return (await (await fetch(BASE + '/version.json', { cache: 'no-store' })).json()).build; } catch { return null; } };
const rebuild = async () => {
  const before = await served();
  execSync('npx vite build', { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { const v = await served(); if (v && v !== before) break; await new Promise(r => setTimeout(r, 500)); }
  await new Promise(r => setTimeout(r, 1500)); // 画面のファイルがそろうのを待つ
  return served();
};

await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // サービスワーカーが画面を受け持った状態にする
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
const v1 = await build();
console.log('  ✓ 古い版を開いた', v1);

// 入力していないとき：前に出したら自動で切り替わる
const v2 = await rebuild();
assert.notEqual(v2, v1);
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await waitBuild(v2);
console.log('  ✓ 入力していないときは自動で新しい版に切り替わる', v2);

// 入力の途中：勝手に読み込み直さず、案内を出す
await page.waitForLoadState('networkidle');
await page.click('text=新しく始める');
await page.fill('input[autocomplete="nickname"]', 'テスト中');
const v3 = await rebuild();
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForSelector('text=新しい版があります', { timeout: 60000 }).catch(async e => {
  const st = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { build: window.__FW_BUILD__, waiting: !!r?.waiting, installing: !!r?.installing, focus: document.activeElement?.tagName, url: location.href }; });
  console.log('状態', JSON.stringify(st), '公開', await served());
  throw e;
});
assert.equal(await build(), v2);
assert.equal(await page.inputValue('input[autocomplete="nickname"]'), 'テスト中');
console.log('  ✓ 入力中は読み込み直さず「新しい版があります」と出す（入力は残る）');
await page.click('text=更新する');
await waitBuild(v3);
console.log('  ✓ 「更新する」で新しい版に切り替わる', v3);

await browser.close();
console.log('版の切り替えの試験、すべて通りました');
