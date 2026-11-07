// Excel・CSV の書き出し（ファイルは端末の中で作る。サーバーには送らない）
import type { Gear, UpdateLog } from './api';

const STATE_JA: Record<string, string> = { old: '更新あり', ok: '最新', unset: '今のバージョン未入力', manual: '自動確認なし', stopped: '確認が止まっている', unknown: '未確認' };

export const GEAR_COLUMNS: [string, (g: Gear) => string][] = [
  ['管理番号', g => g.asset_no ?? ''],
  ['メーカー', g => g.maker],
  ['機種', g => g.model],
  ['シリアル番号', g => g.serial ?? ''],
  ['今のバージョン', g => g.current_version ?? ''],
  ['最新バージョン', g => g.latest?.version ?? ''],
  ['状態', g => STATE_JA[g.state] ?? ''],
  ['購入日', g => g.purchased_on ?? ''],
  ['購入先', g => g.purchased_from ?? ''],
  ['最後の更新', g => g.last_updated_on ?? ''],
  ['メモ', g => g.note ?? ''],
];

export const LOG_COLUMNS: [string, (u: UpdateLog) => string][] = [
  ['更新した日', u => u.updated_on],
  ['管理番号', u => u.asset_no ?? ''],
  ['メーカー', u => u.maker ?? ''],
  ['機種', u => u.model ?? ''],
  ['前のバージョン', u => u.from_version ?? '（登録）'],
  ['新しいバージョン', u => u.to_version],
  ['記録した人', u => u.recorded_by],
  ['メモ', u => u.note ?? ''],
];

/** CSV。Excel で開いても文字化けしないよう、先頭に BOM を付けた UTF-8 にする */
export function toCsv<T>(rows: T[], cols: [string, (x: T) => string][]) {
  const cell = (v: string) => (/[",\r\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : '') + v.replace(/"/g, '""')}"` : v);
  const lines = [cols.map(c => cell(c[0])).join(','), ...rows.map(r => cols.map(c => cell(c[1](r))).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function toXlsx(sheets: { name: string; header: string[]; rows: string[][] }[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  return writeXlsxFile(sheets.map(s => ({
    sheet: s.name,
    data: [s.header.map(h => ({ value: h, fontWeight: 'bold' as const })), ...s.rows.map(r => r.map(v => ({ value: v })))],
    columns: s.header.map((h, i) => ({ width: Math.min(40, Math.max(h.length * 2 + 2, ...s.rows.map(r => (r[i] ?? '').length + 2), 10)) })),
    stickyRowsCount: 1,
  })), { fontFamily: 'Meiryo UI', fontSize: 11 }).toBlob();
}

/** 保存：iPhone・Android は共有シート（「ファイルに保存」を選べる）でまとめて渡す。使えなければダウンロード */
export async function saveFiles(files: { blob: Blob; name: string }[]) {
  const fs = files.map(f => new File([f.blob], f.name, { type: f.blob.type }));
  const nav = navigator as Navigator & { canShare?: (d: any) => boolean };
  if (nav.canShare?.({ files: fs })) {
    try { await nav.share({ files: fs }); return; } catch (e: any) { if (e?.name === 'AbortError') return; }
  }
  for (const [i, f] of files.entries()) {
    if (i) await new Promise(r => setTimeout(r, 400));
    const url = URL.createObjectURL(f.blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: f.name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
