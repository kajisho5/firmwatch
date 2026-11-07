// パスキーの試験：Chrome の仮想の認証器で「新しく始める → ログアウト → ログイン → 引き継ぎコードで入る」を通す
// 使い方：node test/passkey.mjs <サーバーURL>（PLAYWRIGHT_BROWSERS_PATH に Chromium があること）
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8791';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

const step = (s) => console.log('  ✓ ' + s);
await page.goto(BASE + '/');
await page.click('text=新しく始める');
await page.fill('input[autocomplete="nickname"]', 'テスト花子');
await page.click('text=パスキーを作って始める');
await page.waitForSelector('text=引き継ぎコードを');
const code = (await page.locator('p.select-all').textContent()).trim();
assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){4}$/);
step(`パスキーを作って始められる（引き継ぎコード ${code.slice(0, 4)}-…）`);
await page.click('text=保存したので次へ');
await page.waitForSelector('text=確認が要る');
step('ホーム画面（更新の一覧）に入れる');

await page.goto(BASE + '/settings');
await page.click('text=ログアウト');
await page.waitForSelector('text=パスキーでログイン');
step('ログアウトできる');

await page.click('text=パスキーでログイン');
await page.waitForSelector('text=確認が要る');
step('パスキーでログインできる');

await page.goto(BASE + '/settings');
await page.click('text=ログアウト');
await page.click('text=引き継ぎコードで入る');
await page.fill('input[placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"]', code.toLowerCase().replace(/-/g, ' '));
await page.click('button:has-text("入る")');
await page.waitForSelector('text=確認が要る');
step('引き継ぎコードで入れる（小文字・区切りが違っても通る）');

await page.goto(BASE + '/settings');
await page.click('text=ログアウト');
await page.click('text=引き継ぎコードで入る');
await page.fill('input[placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"]', 'AAAA-AAAA-AAAA-AAAA-AAAA');
await page.click('button:has-text("入る")');
await page.waitForSelector('text=引き継ぎコードが違います');
step('違う引き継ぎコードは断る');

assert.deepEqual(errors, []);
console.log('パスキーの試験、すべて通りました');
await browser.close();
