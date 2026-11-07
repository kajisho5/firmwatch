export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RP_NAME: string;
  GITHUB_REPOSITORY: string; // 定期チェックを受け付けるリポジトリ（例 kajisho5/firmwatch）。GitHub Actions の証明で本人確認する
  INTERNAL_TOKEN?: string;   // ローカルの試験用の鍵（本番では入れない）
  DEV_AUTH?: string;        // "1" で localhost だけ開発用ログインを許す
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const now = () => Date.now();
export const DAY = 86_400_000;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(bytes = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return b64url(new Uint8Array(d));
}

/** 文字列の入力を確かめる（長さの上限つき。空なら null） */
export function str(v: unknown, label: string, max = 200): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, `${label}の形が正しくありません。`);
  const t = v.trim();
  if (t.length > max) throw new HttpError(400, `${label}は${max}文字までです。`);
  return t || null;
}

export function date(v: unknown, label: string): string | null {
  const s = str(v, label, 10);
  if (s == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${label}は 2026-11-07 の形で入れてください。`);
  return s;
}

/** 引き継ぎコード：読み間違えにくい文字だけで 4文字×5組 */
export function recoveryCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(20));
  const s = [...b].map(x => chars[x % chars.length]).join('');
  return s.match(/.{4}/g)!.join('-');
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
