// ソーシャルプレビュー画像を作る（リンクを貼ったときに出る画像）
// 機種名・バージョンは載せない（実在しないバージョンを実在の機種に付けないため）
// web/public/og.png（1200×630、サイト用）と docs/social-preview.png（1280×640、GitHub のリポ用）
// 使い方：node tools/make_og.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const font = pathToFileURL(resolve(root, 'node_modules/@fontsource/ibm-plex-sans-jp')).href;
const logo = pathToFileURL(resolve(root, 'docs/logo/kit/lockup-horizontal.svg')).href;

const html = (w, h) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="${font}/400.css"><link rel="stylesheet" href="${font}/600.css"><link rel="stylesheet" href="${font}/700.css">
<style>
*{margin:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;background:#D5D9DD;font-family:'IBM Plex Sans JP',sans-serif;color:#000;position:relative;overflow:hidden}
.l{position:absolute;left:${Math.round(w*0.06)}px;top:${Math.round(h*0.17)}px;width:${Math.round(w*0.50)}px}
.l img{width:100%;display:block}
.l p{margin-top:40px;font-size:32px;font-weight:700;line-height:1.45;letter-spacing:.01em}
.l small{display:block;margin-top:18px;font-size:22px;font-weight:400;color:#4B525A;line-height:1.6}
.r{position:absolute;right:0;top:${Math.round(h*0.14)}px;width:${Math.round(w*0.40)}px;display:flex;flex-direction:column;gap:3px}
.row{background:#F2F3F4;height:${Math.round(h*0.215)}px;padding:0 0 0 64px;position:relative;display:flex;flex-direction:column;justify-content:center}
.row.dim{background:#E4E7EA}
.lamp{position:absolute;left:26px;top:24px;bottom:24px;width:12px;border-radius:3px;border:1px solid #00000033}
.red{background:linear-gradient(#FF5A66,#D70015 45%,#A3000F);box-shadow:0 0 14px #D70015aa}
.green{background:linear-gradient(#3DD27E,#00843D 45%,#005E2B)}
.off{background:linear-gradient(#C4C9CE,#9198A0)}
.t{font-size:28px;font-weight:700}
.v{margin-top:8px;font-size:22px;color:#4B525A}.v b{color:#000}
.dim .t,.dim .v b{color:#4B525A}
</style></head><body>
<div class="l"><img src="${logo}" alt=""><p>機材のファームウェアに<br>新しいバージョンが出たら知らせる。</p>
<small>持っている機材を1台ずつ登録。<br>iPhone・Android に通知が届きます。</small></div>
<div class="r">
<div class="row"><span class="lamp red"></span><div class="t">スイッチャー</div><div class="v">新しいバージョンが出ました</div></div>
<div class="row"><span class="lamp red"></span><div class="t">ワイヤレスマイク</div><div class="v">新しいバージョンが出ました</div></div>
<div class="row dim"><span class="lamp green"></span><div class="t">レコーダー</div><div class="v">最新のバージョンです</div></div>
</div></body></html>`;

const b = await chromium.launch();
for (const [w, h, out] of [[1200, 630, 'web/public/og.png'], [1280, 640, 'docs/social-preview.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const tmp = resolve(root, 'tools/.og.html'); // 手元のフォントとロゴを読めるよう、ファイルとして開く
  writeFileSync(tmp, html(w, h));
  await p.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' });
  rmSync(tmp);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: resolve(root, out) });
  await p.close();
}
await b.close();
console.log('作りました');
