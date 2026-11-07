// 共通の部品（デザイン：docs/design-*.svg）
import { ReactNode } from 'react';
import type { GearState } from './api';
import { go } from './router';

export function Lamp({ state, w = 14, h = 14, quiet = false, className = '' }: { state: 'red' | 'green' | 'off'; w?: number; h?: number | 'stretch'; quiet?: boolean; className?: string }) {
  return <span aria-hidden className={`lamp lamp-${state} ${quiet ? 'lamp-quiet' : ''} ${className}`} style={{ width: w, height: h === 'stretch' ? undefined : h, alignSelf: h === 'stretch' ? 'stretch' : undefined }} />;
}

export const lampOf = (s: GearState): 'red' | 'green' | 'off' => (s === 'old' ? 'red' : s === 'ok' ? 'green' : 'off');

export function stateText(g: { state: GearState; current_version: string | null; latest: { version: string } | null; source_error?: string | null; estimated?: boolean; latest_by?: string | null }) {
  const est = g.latest_by === 'community' ? '（利用者の記録）' : g.estimated ? '（推定）' : '';
  switch (g.state) {
    case 'old': return `最新は ${g.latest!.version}${est}。手元は ${g.current_version}`;
    case 'ok': return `最新の ${g.current_version}${est}`;
    case 'unset': return `最新は ${g.latest!.version}${est}。今のバージョンが未入力です`;
    case 'manual': return g.current_version ? `${g.current_version}（自動では確認していません）` : '自動では確認していません';
    case 'stopped': return g.source_error ? `確認できません：${g.source_error}` : '公開ページを読めず、確認が止まっています';
    default: return g.estimated ? '次の定期チェックで製品ページを確認します' : 'まだ確認していません';
  }
}

export function Screen({ children, tab }: { children: ReactNode; tab?: 0 | 1 | 2 }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[560px] flex-col bg-case">
      <main className={`safe-top flex-1 ${tab !== undefined ? 'pb-[96px]' : 'pb-10'}`}>{children}</main>
      {tab !== undefined && <TabBar active={tab} />}
    </div>
  );
}

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="flex min-h-[64px] items-center justify-between px-5 pt-2">
      <h1 className="text-[24px] font-bold leading-tight">{title}</h1>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}

export function Back({ label, to }: { label: string; to: string }) {
  return (
    <button onClick={() => (history.length > 1 ? history.back() : go(to))} className="flex min-h-[44px] items-center gap-2 px-4 text-[16px] font-medium">
      <svg width="12" height="18" viewBox="0 0 12 18" aria-hidden><path d="M9 1 1 9l8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {label}
    </button>
  );
}

export function TabBar({ active }: { active: 0 | 1 | 2 }) {
  const tabs: [string, string][] = [['更新', '/'], ['機材', '/gear'], ['設定', '/settings']];
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[560px] border-t border-rule bg-panel" aria-label="切り替え">
      <ul className="flex">
        {tabs.map(([name, to], i) => (
          <li key={to} className="flex-1">
            <button onClick={() => go(to)} aria-current={i === active ? 'page' : undefined}
              className={`relative flex h-[64px] w-full items-center justify-center gap-1.5 text-[15px] ${i === active ? 'font-bold text-ink' : 'font-medium text-faint'}`}>
              {i === active && <span className="absolute left-1/2 top-0 h-[3px] w-9 -translate-x-1/2 bg-ink" />}
              {name}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`px-5 pb-2 pt-6 text-[14px] font-semibold text-sub ${className}`}>{children}</h2>;
}

export function Row({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const cls = `flex w-full items-center gap-3 bg-panel px-5 py-3 text-left ${className}`;
  return onClick
    ? <button onClick={onClick} className={`${cls} active:bg-white`}>{children}<Chevron /></button>
    : <div className={cls}>{children}</div>;
}

export function List({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-px">{children}</div>;
}

export function Chevron() {
  return <svg className="ml-auto flex-none text-faint" width="8" height="14" viewBox="0 0 8 14" aria-hidden><path d="m1 1 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Button({ children, onClick, kind = 'primary', disabled, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) {
  const base = 'flex min-h-[50px] w-full items-center justify-center rounded-[6px] px-4 text-[16px] font-semibold disabled:opacity-40';
  const look = kind === 'primary' ? 'bg-ink text-white active:bg-[#2a2a2a]' : 'border-[1.5px] border-ink bg-white text-ink active:bg-panel';
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look} ${className}`}>{children}</button>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-[31px] w-[51px] flex-none rounded-full transition-colors ${on ? 'bg-ink' : 'bg-[#B9BEC3]'}`}>
      <span className={`absolute top-[3px] h-[25px] w-[25px] rounded-full bg-white transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`} />
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block px-5 pt-5">
      <span className="mb-2 block text-[14px] font-semibold text-sub">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-[13px] text-sub">{hint}</span>}
    </label>
  );
}

export const inputCls = 'block h-[50px] w-full rounded-[6px] border border-rule bg-white px-4 text-[16px] placeholder:text-faint focus:border-ink focus:outline-none';

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" className="mx-5 mt-4 bg-tally-soft px-4 py-3 text-[14px] text-ink">{text}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-10">
      <p className="text-[17px] font-bold">{title}</p>
      {children && <div className="mt-2 text-[14px] leading-relaxed text-sub">{children}</div>}
    </div>
  );
}

export function fmtDate(t: number | string | null | undefined, style: 'long' | 'short' = 'long') {
  if (t == null || t === '') return '';
  const d = typeof t === 'number' ? new Date(t) : new Date(t + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(t);
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  return style === 'long' ? `${y}年${m}月${day}日` : `${y}/${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

export function ago(t: number) {
  const d = Date.now() - t;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (t >= today.getTime()) return new Date(t).getHours() < 12 ? '今朝' : '今日';
  if (t >= today.getTime() - 86_400_000) return '昨日';
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}日前`;
  const x = new Date(t);
  return `${x.getMonth() + 1}/${String(x.getDate()).padStart(2, '0')}`;
}
