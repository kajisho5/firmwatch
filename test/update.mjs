// 新しいバージョンへの切り替えの試験：古いバージョンを開いたまま新しいバージョンを公開し、
// 入力していないときは自動で切り替わり、入力中は案内を出してボタンで切り替わることを確かめる
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

// 画面のファイルは、この試験の中の小さな配信役が毎回ディスクから読んで出す。
// wrangler dev の「ファイルの変化を見て読み直す」仕組みは、作り直しの途中を拾うことがあり CI で不安定だったため。
// /api は本物（wrangler dev）へそのまま渡す。
const API = (process.argv[2] || 'http://localhost:8788').replace('localhost', '127.0.0.1');
const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
    const headers = { ...req.headers }; delete headers.host; delete headers.origin;
    const r = await fetch(API + url.pathname + url.search, { method: req.method, headers, body });
    res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k))));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let file = join(DIST, normalize(url.pathname));
  try { if (!statSync(file).isFile()) throw 0; } catch { file = join(DIST, 'index.html'); }
  const noCache = /\/(index\.html|sw\.js|manifest\.webmanifest|version\.json)?$/.test(file.slice(DIST.length - 1)) || file.endsWith('index.html');
  try {
    const data = readFileSync(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': noCache ? 'no-store' : 'public, max-age=31536000, immutable' });
    res.end(data);
  } catch { res.writeHead(503); res.end(); } // 作り直しの途中
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}`;
const exe = existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined;
const browser = await chromium.launch({ executablePath: exe, args: exe ? ['--headless=new'] : [] });
const page = await (await browser.newContext()).newPage();
const logs = [];
const swv = {};
const inflight = new Map();
page.context().on('request', r => inflight.set(r, r.url()));
page.context().on('requestfinished', r => inflight.delete(r));
page.context().on('requestfailed', r => inflight.delete(r));
const cdp = await page.context().newCDPSession(page);
cdp.on('ServiceWorker.workerVersionUpdated', e => { for (const v of e.versions) swv[v.versionId] = `${v.status}/${v.runningStatus}`; });
cdp.on('ServiceWorker.workerErrorReported', e => logs.push('SWエラー ' + e.errorMessage.errorMessage));

page.on('console', m => logs.push(m.text()));
page.on('pageerror', e => logs.push('error: ' + e.message));
page.on('framenavigated', f => { if (f === page.mainFrame()) logs.push('移動'); });
const build = () => page.evaluate(() => window.__FW_BUILD__);
/** 読み込み直しをまたいで、画面のバージョンが v になるのを待つ */
async function waitBuild(v, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await build()) === v) return; } catch { /* 読み込み直しの途中 */ }
    await new Promise(r => setTimeout(r, 300));
  }
  const manual = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); r?.waiting?.postMessage({ type: 'SKIP_WAITING' }); await new Promise(x => setTimeout(x, 3000)); return { stillWaiting: !!r?.waiting }; }).catch(e => 'nav:' + e.message.slice(0, 40));
  logs.push('手で合図→' + JSON.stringify(manual) + ' SW ' + JSON.stringify(swv) + ' 通信中 ' + [...inflight.values()].join(','));
  const st = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r?.waiting, installing: !!r?.installing, active: r?.active?.state, controller: !!navigator.serviceWorker.controller, focus: document.activeElement?.tagName, vis: document.visibilityState }; }).catch(() => ({}));
  throw new Error(`バージョンが ${v} に切り替わりませんでした（今は ${await build().catch(() => '?')}、状態 ${JSON.stringify(st)}、ログ ${logs.slice(-20).join(' | ')}）`);
}
const served = async () => { try { return JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8')).build; } catch { return null; } };
const rebuild = async () => {
  const before = await served();
  execSync('npx vite build', { stdio: 'ignore' }); // 終わった時点でファイルはそろっている
  const v = await served();
  if (!v || v === before) throw new Error(`新しいバージョンが公開されませんでした（前 ${before} / 今 ${v}）`);
  return v;
};

await page.goto(BASE + '/');
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // サービスワーカーが画面を受け持った状態にする
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
const v1 = await build();
console.log('  ✓ 古いバージョンを開いた', v1);

// 開いたとき・戻ったとき（入力していない）：そのまま切り替わり、「更新しました」を出す（T2）
const v2 = await rebuild();
assert.notEqual(v2, v1);
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await waitBuild(v2);
await page.waitForSelector('text=に更新しました', { timeout: 10000 });
console.log('  ✓ 戻ったときは自動で新しいバージョンに切り替わり「更新しました」を出す', v2);
await page.waitForSelector('text=に更新しました', { state: 'detached', timeout: 10000 });
console.log('  ✓ 「更新しました」は少したつと消える');

// 使っている途中に見つかった：読み込み直さず「新しいバージョンがあります」を出す（T1）。✕ で閉じても、次に戻ったとき切り替わる
await page.evaluate(() => window.__FW_IN_USE__());
const v3 = await rebuild();
await page.evaluate(() => window.dispatchEvent(new Event('focus')));
await page.waitForSelector('text=新しいバージョンがあります', { timeout: 60000 });
assert.equal(await build(), v2);
console.log('  ✓ 使っている途中は読み込み直さず「新しいバージョンがあります」を出す');
await page.click('[aria-label="閉じる"]');
await page.waitForSelector('text=新しいバージョンがあります', { state: 'detached' });
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await waitBuild(v3);
console.log('  ✓ 閉じても、次に戻ったときに切り替わる', v3);

// 入力の途中：戻ったときでも勝手に読み込み直さず、知らせを出す
await page.waitForLoadState('networkidle');
await page.click('text=新しく始める');
await page.fill('input[autocomplete="nickname"]', 'テスト中');
const v4 = await rebuild();
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForSelector('text=新しいバージョンがあります', { timeout: 60000 });
assert.equal(await build(), v3);
assert.equal(await page.inputValue('input[autocomplete="nickname"]'), 'テスト中');
console.log('  ✓ 入力中は読み込み直さず知らせを出す（入力は残る）');
await page.click('text=更新する');
await waitBuild(v4);
console.log('  ✓ 「更新する」で新しいバージョンに切り替わる', v4);

// 電波がないときは、保存してある画面で開ける
await page.context().setOffline(true);
await page.reload({ timeout: 20000 });
assert.ok(await build());
await page.context().setOffline(false);
console.log('  ✓ 電波がなくても開ける');

await browser.close();
server.close();
console.log('バージョンの切り替えの試験、すべて通りました');
