// 汎用の見張り：メーカーの製品ページから、ファームウェア・ソフトのバージョンらしき番号を読み取る（推定）
// 専用の読み取り部品がないメーカーのために使う。読むのは robots.txt で禁止されていないページだけ
import { compareVersions } from '../shared/version.js';

/** robots.txt の「User-agent: *」の決まりで、path を読んでよいか（Allow と Disallow の長いほうを優先） */
export function robotsAllows(robotsTxt, path) {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(robotsTxt || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase()); lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
    }
  }
  const mine = groups.filter(g => g.agents.includes('firmwatch'));
  const rules = (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules);
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // 空の Disallow は「すべて許可」
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/** HTML を文字だけにする */
export function textOf(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ');
}

const KEY = /(firmware|ファームウェア|ファーム|software|ソフトウェア|system program|システムプログラム|システムソフトウェア|バージョン|version|ver\.?)\s*[:：]?\s*(?:v(?:er)?\.?\s*)?(\d{1,3}(?:\.\d{1,4}){1,3})/gi;
// ファームウェアのことだと分かる言葉。「Ver」「version」だけの番号は、この言葉が近くにあるときだけ採る
const FW_WORD = /firmware|ファームウェア|ファーム|system program|システムプログラム|システムソフトウェア|本体ソフトウェア|本体プログラム/i;
// 対応OS・通信規格・ファイル形式などの番号を除く
const NOT_FIRMWARE = /(macOS|Mac OS|OS X|Windows|iOS|iPadOS|Android|Linux|USB|HDMI|Bluetooth|Wi-?Fi|Dante|AES67|SMPTE|Ethernet|PoE|Thunderbolt|DisplayPort|Java|\.NET|Chrome|Safari|Firefox|ID3|規格|プロトコル|protocol|API|SDK|PDF|HDCP|NDI|SRT|RTMP)[^。．.!！]{0,14}$/i;

/** ページの文字から、ファームウェアのバージョンらしき番号を拾う。いちばん新しいものを返す（無ければ null） */
export function findVersion(html) {
  const text = textOf(html);
  const found = [];
  for (const m of text.matchAll(KEY)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 16);
    if (/^\s*(以降|以上|より|から|or later|or newer|and later|\+)/i.test(after)) continue; // 「12.0 以降」「Ver.1.71より」
    // 「Firmware 4.15」「Software v2.1.7」のように、ファームを指す言葉の直後の番号は信用する
    const direct = FW_WORD.test(m[1]) || /software|ソフトウェア/i.test(m[1]);
    if (!direct) {
      if (NOT_FIRMWARE.test(before.slice(-24))) continue;               // 「Bluetooth 標準規格 Ver 4.2」「macOS バージョン 14.0」
      if (!FW_WORD.test(before)) continue;                               // 「Ver」だけでは採らない
    } else if (/(macOS|Mac OS|OS X|Windows|iOS|iPadOS|Android|Linux)\s*$/i.test(before)) continue; // 「Windows ソフトウェア 3.1」
    found.push({ version: m[2], context: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim() });
  }
  if (!found.length) return null;
  found.sort((a, b) => compareVersions(b.version, a.version));
  return found[0];
}

/** 文字コードを見て文字にする（日本のメーカーには Shift_JIS・EUC-JP のページがある） */
export function decodeHtml(bytes, contentType = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let cs = (contentType.match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) {
    const head = new TextDecoder('latin1').decode(u8.slice(0, 4096));
    cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
  }
  cs = (cs || 'utf-8').toLowerCase();
  if (['shift_jis', 'sjis', 'x-sjis', 'ms_kanji', 'windows-31j', 'cp932'].includes(cs)) cs = 'shift_jis';
  try { return new TextDecoder(cs).decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
}

/**
 * 見張りの一覧を読み、結果を作る（通信する関数は外から渡す。試験しやすくするため）
 * @param {{key:string, url:string, model:string, maker:string}[]} list
 * @param {(url:string)=>Promise<{status:number, text:string}>} get
 */
export async function watchPages(list, get, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  const robots = new Map();
  const lastHit = new Map();
  const out = [];
  for (const w of list) {
    let u;
    try { u = new URL(w.url); } catch { out.push({ key: w.key, ok: false, error: 'メーカーのページの URL が正しくありません' }); continue; }
    // 同じサイトには間をあけて読む
    const wait = 1500 - (Date.now() - (lastHit.get(u.host) ?? 0));
    if (wait > 0) await sleep(wait);
    try {
      if (!robots.has(u.origin)) {
        const r = await get(`${u.origin}/robots.txt`).catch(() => ({ status: 0, text: '' }));
        robots.set(u.origin, r.status === 200 ? r.text : r.status === 401 || r.status === 403 ? null : '');
        lastHit.set(u.host, Date.now());
        await sleep(1500);
      }
      const rb = robots.get(u.origin);
      if (rb === null) { out.push({ key: w.key, ok: false, error: 'メーカーのサイトが機械からのアクセスを断っています' }); continue; }
      if (!robotsAllows(rb, u.pathname + u.search)) { out.push({ key: w.key, ok: false, error: 'メーカーのサイトが、このページを機械で読むことを認めていません' }); continue; }
      const res = await get(w.url);
      lastHit.set(u.host, Date.now());
      if (res.status === 403 || res.status === 401) { out.push({ key: w.key, ok: false, error: 'メーカーのサイトが機械からのアクセスを断っています' }); continue; }
      if (res.status !== 200) { out.push({ key: w.key, ok: false, error: `メーカーのページを開けませんでした（${res.status}）` }); continue; }
      const hit = findVersion(res.text);
      if (!hit) { out.push({ key: w.key, ok: false, error: 'メーカーのページにバージョンの記載が見つかりません' }); continue; }
      out.push({
        key: w.key, ok: true, releases: [{
          version: hit.version, title: `${w.model} ${hit.version}（製品ページの記載）`, released_at: null,
          notes: `メーカーの製品ページで「${hit.context}」という記載を見つけました。ページの記載から読み取った推定です。`,
          url: w.url, severity: 'now',
        }],
      });
    } catch (e) {
      out.push({ key: w.key, ok: false, error: `メーカーのページを読めませんでした（${String(e.message || e).slice(0, 100)}）` });
    }
  }
  return out;
}
