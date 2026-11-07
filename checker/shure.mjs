// Shure：公式サイトの「Software & Firmware Archive」を、ブラウザで表示した状態で読む
// （一覧はページを開いたあとに読み込まれるため、普通に取得しただけでは載っていない）
// robots.txt は 2026-11-07 に確認：User-agent: * は Allow: /（ログイン・広告のページだけ禁止）
import { compareVersions } from '../shared/version.js';

export const SHURE_ARCHIVE = 'https://www.shure.com/en-US/support/downloads/software-firmware-archive';
const TYPES = new Set(['APP', 'SOFTWARE', 'FIRMWARE', 'PLUGIN', 'PLUG-IN', 'DRIVER', 'UTILITY']);
const DATE = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/;

/** 型番の比べ方：英数字だけ、大文字 */
export const normModel = s => String(s).toUpperCase().replace(/\+/g, 'PLUS').replace(/[^A-Z0-9]/g, '');

/** 一覧の文字から行を取り出す：種類 / 名前 / バージョン / (See Release Notes) / 日付 / 対象の機種 */
export function parseShureArchive(text) {
  const L = String(text).split('\n').map(s => s.trim()).filter(Boolean);
  const rows = [];
  for (let i = 0; i < L.length; i++) {
    if (!TYPES.has(L[i]) || i + 4 >= L.length) continue;
    const [type, title, version] = [L[i], L[i + 1], L[i + 2]];
    let j = i + 3;
    if (/^See Release/i.test(L[j])) j++;
    if (!/^\d+(\.\d+)+/.test(version) || !DATE.test(L[j] ?? '')) continue;
    rows.push({ type, title, version, date: Date.parse(L[j] + ' UTC') || null, products: L[j + 1] ?? '' });
    i = j + 1;
  }
  return rows;
}

/** ファームウェアの行を、型番ごとのバージョンの一覧にする（キーは shure:<型番>） */
export function shureReleases(rows) {
  const out = {};
  for (const r of rows) {
    if (r.type !== 'FIRMWARE') continue;
    // 対象の機種の欄と、名前（「Axient Digital Transmitters - AD1, AD2, and ADX3」のように後ろに型番が並ぶこともある）から型番を拾う
    const parts = [r.products, ...r.title.split(' - ')].flatMap(x => x.split(/,|&|\band\b/));
    const names = new Set(parts.map(normModel).filter(n => n.length >= 3 && n.length <= 24));
    for (const n of names) {
      const key = `shure:${n}`;
      const list = (out[key] ??= []);
      if (list.some(x => x.version === r.version)) continue;
      list.push({
        version: r.version, title: `${r.title} ${r.version}`, released_at: r.date,
        notes: `Shure のソフトウェア・ファームウェア一覧に「${r.title}」${r.version} が載りました（対象：${r.products}）。`,
        url: SHURE_ARCHIVE, severity: 'later',
      });
    }
  }
  for (const k of Object.keys(out)) out[k] = out[k].sort((a, b) => compareVersions(b.version, a.version)).slice(0, 12);
  return out;
}

/** ブラウザで一覧の全ページを表示して文字を集める（100件ずつ、間をあけて） */
export async function fetchShureArchive({ maxPages = 30, wait = 2000 } = {}) {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  const exe = process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  const browser = await chromium.launch({ executablePath: exe, args: exe ? ['--headless=new'] : [] });
  try {
    const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; FIRMWATCH/0.1; +https://github.com/kajisho5/firmwatch)', locale: 'en-US' });
    const texts = [];
    let total = Infinity;
    for (let cur = 1; cur <= maxPages && (cur - 1) * 100 < total; cur++) {
      await page.goto(`${SHURE_ARCHIVE}?size=n_100_n&current=n_${cur}_n&sort-field=versionreleasedate&sort-direction=desc`, { waitUntil: 'networkidle', timeout: 60_000 });
      await page.waitForTimeout(wait);
      const t = await page.evaluate(() => document.body.innerText);
      const m = t.match(/of ([\d,]+) results/);
      if (m) total = Number(m[1].replace(/,/g, ''));
      texts.push(t);
    }
    return texts.join('\n');
  } finally {
    await browser.close();
  }
}
