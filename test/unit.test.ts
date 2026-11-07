import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareVersions, severityOf } from '../shared/version.js';
import { parseBlackmagic, parseAppleRss, parseWindows } from '../checker/adapters.mjs';
import { toCsv } from '../web/src/exporter';

const fx = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const sources = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8')).sources;

describe('バージョンの比較', () => {
  it('数字の並びで比べる', () => {
    expect(compareVersions('10.1.2', '10.2')).toBeLessThan(0);
    expect(compareVersions('10.2', '10.2.0')).toBe(0);
    expect(compareVersions('11.0.1', '9.9')).toBeGreaterThan(0);
    expect(compareVersions('Ver.3.60', '3.6')).toBeGreaterThan(0);
    expect(compareVersions('24H2', '25H2')).toBeLessThan(0);
  });
  it('文言から重要度を決める', () => {
    expect(severityOf('macOS 27 のサポートを追加')).toBe('now');
    expect(severityOf('不具合を修正')).toBe('now');
    expect(severityOf('全体的な性能を向上')).toBe('later');
  });
});

describe('Blackmagic の読み取り', () => {
  const r = parseBlackmagic(JSON.parse(fx('bmd-downloads.json')), sources.filter((s: any) => s.key.startsWith('bmd:')));
  it('ATEM Switchers の最新と履歴が取れる', () => {
    const atem = r['bmd:atem:ATEM Switchers'];
    expect(atem.length).toBeGreaterThan(3);
    expect(atem[0].version).toBe('11.0.1');
    expect(atem[0].released_at).toBeTypeOf('number');
    expect(atem[0].url).toContain('blackmagicdesign.com');
    // 新しい順
    for (let i = 1; i < atem.length; i++) expect(compareVersions(atem[i - 1].version, atem[i].version)).toBeGreaterThan(0);
  });
  it('ベータ版は入れない', () => {
    for (const list of Object.values(r)) for (const x of list as any[]) expect(x.title).not.toMatch(/beta/i);
  });
  it('SDK は入れない', () => {
    for (const x of r['bmd:atem:ATEM Switchers']) expect(x.title).not.toMatch(/SDK/);
  });
  it('壊れたデータでも落ちない', () => {
    expect(parseBlackmagic({}, sources.filter((s: any) => s.key.startsWith('bmd:')))['bmd:atem:ATEM Switchers']).toEqual([]);
  });
});

describe('OS の読み取り', () => {
  it('Apple：正式版の macOS と iPadOS だけ', () => {
    const r = parseAppleRss(fx('apple-releases.rss'));
    expect(r['os:macos'].length).toBeGreaterThan(0);
    for (const x of [...r['os:macos'], ...r['os:ipados']]) {
      expect(x.version).toMatch(/^\d+(\.\d+)*$/);
      expect(x.title).not.toMatch(/beta|RC/i);
    }
  });
  it('Windows：機能更新のバージョン', () => {
    const r = parseWindows(fx('windows11.html'));
    expect(r['os:windows'].map((x: any) => x.version)).toContain('25H2');
  });
});

describe('CSV', () => {
  it('BOM 付き、カンマ・改行・式に見える値を守る', () => {
    const csv = toCsv([{ a: 'x,y', b: '=1+1', c: '行1\n行2' }], [['A', (r: any) => r.a], ['B', (r: any) => r.b], ['C', (r: any) => r.c]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"x,y"');
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).toContain('"行1\n行2"');
  });
});
