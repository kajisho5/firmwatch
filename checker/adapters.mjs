// メーカー・OS の公開情報から、取得先ごとのバージョンの一覧を取り出す（通信はしない。試験できるように分けている）
import { severityOf, compareVersions } from '../shared/version.js';

const KEEP = 12; // 取得先ごとに残す件数（新しい順）

/**
 * Blackmagic Design の downloads.json（/api/support/jp/downloads.json）
 * @param {any} json  @param {{key:string,page:string}[]} sources  key は "bmd:<product>:<タイトルの頭>"
 */
export function parseBlackmagic(json, sources) {
  const out = {};
  const list = Array.isArray(json?.downloads) ? json.downloads : [];
  for (const s of sources) {
    const [, product, prefix] = s.key.split(':');
    const seen = new Map();
    for (const d of list) {
      if (d.type !== 'Product Release') continue;
      for (const urls of Object.values(d.urls || {})) {
        for (const u of urls || []) {
          if (u.product !== product) continue;
          const title = String(u.downloadTitle || '');
          if (!title.startsWith(prefix + ' ')) continue;
          if (/beta/i.test(title) || (u.beta != null && u.beta !== 255)) continue;
          const version = title.slice(prefix.length + 1).trim();
          if (!/^\d+(\.\d+)*$/.test(version) || seen.has(version)) continue;
          const notes = String(d.desc || '').trim();
          seen.set(version, {
            version, title: d.name || title, released_at: Number(d.numericDate) || null,
            notes, url: s.page, severity: severityOf(notes),
          });
        }
      }
    }
    out[s.key] = [...seen.values()].sort((a, b) => compareVersions(b.version, a.version)).slice(0, KEEP);
  }
  return out;
}

/** XML の文字参照を戻す */
function unxml(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}

/**
 * Apple Developer の Releases RSS（https://developer.apple.com/news/releases/rss/releases.rss）
 * 正式バージョン（beta・RC を除く）の macOS / iPadOS を取り出す
 */
export function parseAppleRss(xml) {
  const res = { 'os:macos': [], 'os:ipados': [] };
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const it of items) {
    const title = unxml((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const m = title.match(/^(macOS|iPadOS) (\d+(?:\.\d+)*) \(([0-9A-Za-z]+)\)$/);
    if (!m) continue; // "beta" "RC" などはここで外れる
    const key = m[1] === 'macOS' ? 'os:macos' : 'os:ipados';
    if (res[key].some(r => r.version === m[2])) continue;
    const link = unxml((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '');
    const date = Date.parse(unxml((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || ''));
    res[key].push({
      version: m[2], title: `${m[1]} ${m[2]}`, released_at: Number.isFinite(date) ? date : null,
      notes: `${m[1]} ${m[2]}（ビルド ${m[3]}）が公開されました。`, url: link || 'https://developer.apple.com/news/releases/',
      severity: 'now',
    });
  }
  for (const k of Object.keys(res)) res[k] = res[k].sort((a, b) => compareVersions(b.version, a.version)).slice(0, KEEP);
  return res;
}

/**
 * Microsoft の Windows 11 リリース情報のページ
 * 機能更新（"Version 25H2 (OS build 26200)"）だけを取り出す。毎月の品質更新は数が多いので対象にしない
 */
export function parseWindows(html) {
  const found = new Map();
  for (const m of String(html).matchAll(/Version (\d{2}H[12]) \(OS build (\d+)\)/g)) {
    if (!found.has(m[1])) found.set(m[1], m[2]);
  }
  const list = [...found.entries()].map(([v, build]) => ({
    version: v, title: `Windows 11 バージョン ${v}`, released_at: null,
    notes: `Windows 11 の機能更新 ${v}（OS ビルド ${build}）が出ています。`,
    url: 'https://learn.microsoft.com/ja-jp/windows/release-health/windows11-release-information', severity: 'now',
  }));
  return { 'os:windows': list.sort((a, b) => compareVersions(b.version, a.version)).slice(0, KEEP) };
}
