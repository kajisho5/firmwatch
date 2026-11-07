// 通知の受け取りの試験：Chrome に届いたことにして、サービスワーカーが通知を出すかを確かめる。
// あわせて、定期チェックが使う送信の部品（web-push）で、暗号化した送信内容が作れるかも確かめる
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import * as webpush from 'web-push';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:8791';

// 1. 送信側：本物と同じ形の鍵で、送信内容を作れるか
const keys = webpush.generateVAPIDKeys();
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const sub = { endpoint: 'https://push.example.invalid/x', keys: { p256dh: ecdh.getPublicKey('base64url'), auth: randomBytes(16).toString('base64url') } };
const req = webpush.generateRequestDetails(sub, JSON.stringify({ title: '確認が要る更新', body: 'テスト', url: '/', tag: 'now' }), { vapidDetails: { subject: 'https://github.com/kajisho5/firmwatch', publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 60 });
assert.equal(req.method, 'POST'); assert.ok(req.headers.Authorization.startsWith('vapid t=')); assert.equal(req.headers['Content-Encoding'], 'aes128gcm'); assert.ok(req.body.length > 100);
console.log('  ✓ 送信内容を暗号化して作れる（aes128gcm、VAPID）');

// 2. 受け取り側：サービスワーカーが通知を出すか
// 通知の表示は headless-shell では動かないため、入っていれば通常の Chrome を使う
const exe = process.env.CHROME_PATH || (await import('node:fs')).existsSync('/usr/bin/google-chrome') ? (process.env.CHROME_PATH || '/usr/bin/google-chrome') : undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--headless=new'] });
const ctx = await browser.newContext();
await ctx.grantPermissions(['notifications'], { origin: BASE });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
let regId = null;
cdp.on('ServiceWorker.workerRegistrationUpdated', e => { for (const r of e.registrations) if (!r.isDeleted) regId = r.registrationId; });
await cdp.send('ServiceWorker.enable');
await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
for (let i = 0; i < 50 && !regId; i++) await page.waitForTimeout(100);
assert.ok(regId, 'サービスワーカーが登録されていない');
console.log('  ✓ サービスワーカーが登録される');
await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(BASE).origin, registrationId: regId, data: JSON.stringify({ title: '確認が要る更新', body: 'ATEM Switchers 11.0.1 が出ました。', url: '/', tag: 'now' }) });
let shown = [];
for (let i = 0; i < 30 && !shown.length; i++) {
  await page.waitForTimeout(200);
  shown = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ title: n.title, body: n.body, tag: n.tag })));
}
assert.equal(shown.length, 1); assert.equal(shown[0].title, '確認が要る更新'); assert.equal(shown[0].tag, 'now');
console.log(`  ✓ 届いた通知を表示する（${shown[0].title}：${shown[0].body}）`);
await browser.close();
console.log('通知の試験、すべて通りました');
