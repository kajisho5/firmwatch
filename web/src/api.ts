// サーバーとのやりとり
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, '通信できませんでした。電波の届く場所でもう一度お試しください。');
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `うまくいきませんでした（${res.status}）`);
  return data as T;
}

export type GearState = 'old' | 'ok' | 'unset' | 'manual' | 'stopped' | 'unknown';

export interface Gear {
  id: string; model_id: number | null; maker: string; model: string; sub: string;
  source_key: string | null; source_label: string | null; page_url: string | null; checked_at: number | null;
  source_error: string | null; estimated: boolean;
  asset_no: string | null; serial: string | null; purchased_on: string | null; purchased_from: string | null;
  current_version: string | null; last_updated_on: string | null; note: string | null; created_at: number;
  latest: { version: string; title: string; released_at: number | null; url: string } | null;
  state: GearState;
}

export interface Alert {
  id: string; severity: 'now' | 'later'; created_at: number; read_at: number | null;
  source_key: string; version: string; title: string; notes: string; url: string; released_at: number | null;
  source_label: string; is_os: boolean; units: number; models: string[]; from: string | null;
}

export interface Me {
  user: { id: string; name: string; digest_weekday: number; digest_hour: number; os_macos: number; os_windows: number; os_ipados: number };
  pushSubs: { endpoint: string; label: string | null; created_at: number }[];
  passkeys: number;
}

export interface UpdateLog { id: string; gear_id: string; from_version: string | null; to_version: string; updated_on: string; recorded_by: string; note: string | null; asset_no?: string | null; maker?: string; model?: string }

/** 最後に読んだ内容を端末に残す（電波のない場所でも一覧を見られるように）。保存できない環境では何もしない */
export const cache = {
  get<T>(k: string): T | null { try { const s = localStorage.getItem('fw:' + k); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem('fw:' + k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};
