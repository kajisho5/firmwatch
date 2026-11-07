import { describe, it, expect } from 'vitest';
import { robotsAllows, findVersion, watchPages, decodeHtml } from '../checker/pagewatch.mjs';

describe('robots.txt', () => {
  const r = `User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /support/\nAllow: /support/public/\nDisallow: /*.pdf$\n`;
  it('禁止された場所は読まない', () => {
    expect(robotsAllows(r, '/support/updates/')).toBe(false);
    expect(robotsAllows(r, '/jp/products/v-160hd/')).toBe(true);
  });
  it('Allow のほうが長ければ読める', () => expect(robotsAllows(r, '/support/public/x')).toBe(true));
  it('ワイルドカードと末尾の $', () => {
    expect(robotsAllows(r, '/a/manual.pdf')).toBe(false);
    expect(robotsAllows(r, '/a/manual.pdf?x=1')).toBe(true);
  });
  it('robots.txt が無ければ読める', () => expect(robotsAllows('', '/any')).toBe(true));
  it('すべて禁止', () => expect(robotsAllows('User-agent: *\nDisallow: /', '/x')).toBe(false));
});

describe('バージョンの読み取り（推定）', () => {
  it('ファームウェアの記載を拾う', () => {
    expect(findVersion('<p>最新ファームウェア Ver.2.10 を公開しました</p><p>Firmware 2.9 の変更点</p>')?.version).toBe('2.10');
  });
  it('対応OSや規格の数字は拾わない', () => {
    expect(findVersion('<p>macOS バージョン 14.0 以降に対応。USB 3.0、HDMI 2.1</p>')).toBeNull();
    expect(findVersion('<p>対応OS：Windows 11。ソフトウェア 3.1 以降が必要</p>')).toBeNull();
  });
  it('スクリプトの中は読まない', () => {
    expect(findVersion('<script>var version = "9.9.9"</script><p>System Program Ver.1.20</p>')?.version).toBe('1.20');
  });
  it('記載が無ければ null', () => expect(findVersion('<p>高画質なスイッチャー</p>')).toBeNull());
  it('通信規格・ファイル形式の番号は拾わない（実際のページで起きた例）', () => {
    expect(findVersion('<p>その他 Bluetooth 標準規格Ver 4.2 対応プロファイル</p>')).toBeNull();
    expect(findVersion('<p>VBR対応、ID3TAG Ver. 2.4対応</p>')).toBeNull();
    expect(findVersion('<p>With the official release of version 10.1 coming soon</p>')).toBeNull();
  });
  it('「Ver.1.71より○○に対応」は最新とは限らないので拾わない', () => {
    expect(findVersion('<p>※Ver. 1.71よりゲイン可変に対応。</p>')).toBeNull();
  });
  it('ファームウェアの言葉が近くにあれば Ver でも拾う', () => {
    expect(findVersion('<p>ファームウェア更新のお知らせ：Ver.4.10 を公開</p>')?.version).toBe('4.10');
  });
  it('近くに PDF などがあっても「Firmware 4.15」は採る', () => {
    expect(findVersion('<p>Multi-language PDF Firmware Firmware v 4.15 ZIP Release notes</p>')?.version).toBe('4.15');
    expect(findVersion('<p>HELO Plus Software v2.1.7 (Release Date 9/1/2026)</p>')?.version).toBe('2.1.7');
  });
  it('Shift_JIS のページを読める', () => {
    const sjis = new Uint8Array([0x83, 0x74, 0x83, 0x40, 0x81, 0x5b, 0x83, 0x80, 0x83, 0x45, 0x83, 0x46, 0x83, 0x41, 0x20, 0x56, 0x65, 0x72, 0x2e, 0x32, 0x2e, 0x31]);
    const t = decodeHtml(sjis, 'text/html; charset=Shift_JIS');
    expect(t).toBe('ファームウェア Ver.2.1');
    expect(findVersion(t)?.version).toBe('2.1');
  });
});

describe('見張りの流れ', () => {
  const pages: Record<string, { status: number; text: string }> = {
    'https://a.example/robots.txt': { status: 200, text: 'User-agent: *\nDisallow: /support/' },
    'https://a.example/products/x': { status: 200, text: '<p>ファームウェア Ver.3.2</p>' },
    'https://b.example/robots.txt': { status: 403, text: '' },
    'https://c.example/robots.txt': { status: 404, text: '' },
    'https://c.example/p': { status: 200, text: '<p>製品の紹介</p>' },
  };
  const get = async (u: string) => pages[u] ?? { status: 404, text: '' };
  it('読めるもの・断られるもの・禁止されたもの・記載なしを分ける', async () => {
    const r = await watchPages([
      { key: 'page:1', url: 'https://a.example/products/x', model: 'X', maker: 'A' },
      { key: 'page:2', url: 'https://a.example/support/y', model: 'Y', maker: 'A' },
      { key: 'page:3', url: 'https://b.example/p', model: 'Z', maker: 'B' },
      { key: 'page:4', url: 'https://c.example/p', model: 'W', maker: 'C' },
    ], get, async () => {});
    expect(r[0]).toMatchObject({ key: 'page:1', ok: true });
    expect(r[0].releases[0].version).toBe('3.2');
    expect(r[1]).toMatchObject({ ok: false });
    expect(r[1].error).toContain('認めていません');
    expect(r[2].error).toContain('断っています');
    expect(r[3].error).toContain('見つかりません');
  });
});

import { parseShureArchive, shureReleases } from '../checker/shure.mjs';
import { readFileSync } from 'node:fs';
describe('Shure の一覧', () => {
  const rows = parseShureArchive(readFileSync(new URL('./fixtures/shure-archive.txt', import.meta.url), 'utf8'));
  it('行を取り出せる', () => {
    expect(rows.length).toBeGreaterThan(150);
    expect(rows.every(r => /^\d+(\.\d+)+/.test(r.version))).toBe(true);
  });
  it('型番ごとに最新のファームウェアが分かる（完全一致だけ）', () => {
    const m = shureReleases(rows);
    expect(m['shure:MXW2XSM58']?.[0].version).toBeTruthy();
    expect(m['shure:MXWNDX']?.[0].version).toMatch(/^\d/);
    expect(m['shure:AD2']?.[0].version).toMatch(/^\d/); // 名前の後ろに並ぶ型番
    // アプリ・ソフトは入れない
    expect(m['shure:SHUREDISCOVERY']).toBeUndefined(); // ソフト（Shure Discovery）は入れない
  });
});
describe('Shure の型番', () => {
  it('「+」付きは別の型番', () => {
    const m = shureReleases([{ type: 'FIRMWARE', title: 'GLXD4+', version: '2.0.18', date: 1, products: 'GLXD4+' }]);
    expect(m['shure:GLXD4PLUS']).toBeTruthy();
    expect(m['shure:GLXD4']).toBeUndefined();
  });
});
