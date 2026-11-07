// S3 機材を追加：ジャンル・メーカーからたどって選ぶ（設計 14章、デザイン B1〜B4）
// 今いる段は URL に持つ（/add?by=maker、/add?cat=映像&sub=スイッチャー&f=Roland、/add?maker=Roland&f=スイッチャー）。
// こうしておくと、戻るボタンや iPhone の端からのスワイプで1段ずつ戻れる。
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Back, SectionTitle } from '../ui';
import { go } from '../router';

export interface Hit { id: number; maker: string; model: string; sub: string; discontinued: number; source_key: string | null; source_label: string | null; maker_url?: string | null }
interface Item { name: string; n: number; examples?: string[]; category?: string }

const fmt = (n: number) => n.toLocaleString('ja-JP');
const norm = (s: string) => s.replace(/[\s\-_/.()（）]/g, '').toLowerCase();
const url = (p: Record<string, string | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/add?${s}` : '/add';
};

function checkText(h: Hit) {
  if (h.source_key?.startsWith('bmd:') || h.source_key?.startsWith('os:') || h.source_key?.startsWith('shure:')) return '';
  return h.source_key || h.maker_url ? '、製品ページで確認（推定）' : '、自動確認なし';
}

export function ModelRow({ h, onPick, showSub = true }: { h: Hit; onPick: () => void; showSub?: boolean }) {
  const detail = `${showSub ? h.sub : ''}${h.discontinued ? '、生産終了' : ''}${checkText(h)}`.replace(/^、/, '');
  return (
    <button onClick={onPick} className="min-h-[59px] w-full bg-panel px-5 py-2.5 text-left active:bg-white">
      <span className="block text-[16px] font-medium">{h.model}</span>
      {detail && <span className="block text-[12.5px] text-sub">{detail}</span>}
    </button>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="px-5 pt-4">
      <label className="flex h-[48px] items-center gap-3 rounded-[6px] border-[1.5px] border-ink bg-white px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ink">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><circle cx="7.5" cy="7.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m12 12 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <input className="h-full min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none focus-visible:outline-none" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder} />
      </label>
    </div>
  );
}

function NavRow({ name, sub, n, onClick, id }: { name: string; sub?: string; n: number; onClick: () => void; id?: string }) {
  return (
    <button id={id} onClick={onClick} className={`flex w-full items-center gap-3 bg-panel pl-5 pr-4 text-left active:bg-white ${sub ? 'min-h-[62px] py-2' : 'min-h-[52px]'}`}>
      <span className="min-w-0 flex-1">
        <span className={`block text-[16px] ${sub ? 'font-semibold' : 'font-medium'}`}>{name}</span>
        {sub && <span className="block truncate text-[12.5px] text-sub">{sub}</span>}
      </span>
      <span className="text-[13px] text-sub">{fmt(n)}</span>
      <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden className="text-faint"><path d="m1 1 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  );
}

function useItems(path: string | null) {
  const [d, setD] = useState<{ items: Item[]; owned?: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    setD(null); setErr(null);
    api<{ items: Item[]; owned?: string[] }>(path).then(setD).catch(e => setErr(e.message));
  }, [path]);
  return { d, err };
}

const Loading = ({ err }: { err?: string | null }) => <p className="px-5 pt-6 text-[14px] text-sub">{err ?? '読み込み中…'}</p>;

/** 入口（B1・B4）：ジャンルから／メーカーから */
function Top({ by, onManual }: { by: 'genre' | 'maker'; onManual?: () => void }) {
  const { d, err } = useItems(`/api/browse?by=${by}`);
  return (
    <>
      <div className="px-5 pt-4" role="tablist" aria-label="選び方">
        <div className="flex rounded-[6px] bg-[#C9CED3] p-0.5">
          {(['genre', 'maker'] as const).map(k => (
            <button key={k} role="tab" aria-selected={by === k} onClick={() => go(url({ by: k === 'maker' ? 'maker' : undefined }), true)}
              className={`h-9 flex-1 rounded-[5px] text-[15px] ${by === k ? 'bg-white font-bold' : 'font-medium text-sub'}`}>
              {k === 'genre' ? 'ジャンルから' : 'メーカーから'}
            </button>
          ))}
        </div>
      </div>
      {!d ? <Loading err={err} /> : by === 'genre' ? (
        <div className="mt-4 flex flex-col gap-px">
          {d.items.map(g => <NavRow key={g.name} name={g.name} sub={`${g.examples?.join('、')}…`} n={g.n} onClick={() => go(url({ cat: g.name }))} />)}
        </div>
      ) : <Makers items={d.items} owned={d.owned ?? []} />}
      <p className="px-5 pt-4 text-[12.5px] text-sub">数字は機種の数。無ければ{onManual ? <button className="font-semibold text-ink underline underline-offset-4" onClick={onManual}>手で入力</button> : '手で入力'}できます。</p>
    </>
  );
}

const headOf = (name: string) => (/^[A-Za-z]/.test(name) ? name[0].toUpperCase() : /^[\x00-\x7F]/.test(name) ? '#' : 'あ');

/** メーカーの一覧（B4）。右端の索引をなぞると飛べる */
function Makers({ items, owned }: { items: Item[]; owned: string[] }) {
  const sections = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) { const h = headOf(it.name); m.set(h, [...(m.get(h) ?? []), it]); }
    return [...m.entries()];
  }, [items]);
  const mine = items.filter(i => owned.includes(i.name));
  const bar = useRef<HTMLDivElement>(null);
  const jump = (clientY: number) => {
    const el = bar.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(sections.length - 1, Math.floor(((clientY - r.top) / r.height) * sections.length)));
    document.getElementById(`mk-${sections[i][0]}`)?.scrollIntoView({ block: 'start' });
  };
  return (
    <div className="relative">
      {mine.length > 0 && (
        <>
          <SectionTitle>持っている機材のメーカー</SectionTitle>
          <div className="flex flex-col gap-px">{mine.map(m => <NavRow key={m.name} name={m.name} n={m.n} onClick={() => go(url({ maker: m.name }))} />)}</div>
        </>
      )}
      {sections.map(([h, list]) => (
        <section key={h}>
          <h2 id={`mk-${h}`} className="scroll-mt-2 px-5 pb-2 pt-5 text-[14px] font-semibold text-sub">{h === 'あ' ? '日本語のメーカー' : h}</h2>
          <div className="flex flex-col gap-px pr-5">{list.map(m => <NavRow key={m.name} name={m.name} n={m.n} onClick={() => go(url({ maker: m.name }))} />)}</div>
        </section>
      ))}
      <div ref={bar} aria-hidden className="fixed right-0 top-1/2 z-10 flex w-6 -translate-y-1/2 touch-none select-none flex-col items-center py-1"
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); jump(e.clientY); }}
        onPointerMove={e => { if (e.buttons) jump(e.clientY); }}>
        {sections.map(([h]) => <span key={h} className="text-[10.5px] font-semibold leading-[17px]">{h}</span>)}
      </div>
    </div>
  );
}

/** ジャンルの中（B2）：種類の一覧。検索はこのジャンルの中だけ */
function Genre({ cat, onPick }: { cat: string; onPick: (h: Hit) => void }) {
  const { d, err } = useItems(`/api/browse?cat=${encodeURIComponent(cat)}`);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = window.setTimeout(() => {
      api<{ models: Hit[] }>(`/api/models?cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(q)}`).then(r => setHits(r.models)).catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, cat]);
  return (
    <>
      <Back label="機材を追加" to="/add" />
      <h1 className="px-5 pt-2 text-[28px] font-bold">{cat}</h1>
      <SearchBox value={q} onChange={setQ} placeholder={`${cat}の中で探す`} />
      {hits ? (
        hits.length === 0 ? <p className="px-5 pt-6 text-[14px] text-sub">見つかりませんでした。</p>
          : <div className="mt-4 flex flex-col gap-px">{hits.map(h => <ModelRow key={h.id} h={{ ...h, model: `${h.maker} ${h.model}` }} onPick={() => onPick(h)} />)}</div>
      ) : !d ? <Loading err={err} /> : (
        <>
          <SectionTitle>種類（機種の多い順）</SectionTitle>
          <div className="flex flex-col gap-px">{d.items.map(s => <NavRow key={s.name} name={s.name} n={s.n} onClick={() => go(url({ cat, sub: s.name }))} />)}</div>
        </>
      )}
    </>
  );
}

/** 種類の中・メーカーの中（B3）：絞り込みの丸ボタンと機種の一覧 */
function List({ cat, sub, maker, filter, onPick }: { cat?: string; sub?: string; maker?: string; filter?: string; onPick: (h: Hit) => void }) {
  const byMaker = !!maker; // メーカーからたどった（丸ボタンは種類）
  const facetPath = byMaker ? `/api/browse?maker=${encodeURIComponent(maker!)}` : `/api/browse?cat=${encodeURIComponent(cat ?? '')}&sub=${encodeURIComponent(sub ?? '')}`;
  const { d: facets } = useItems(facetPath);
  const [models, setModels] = useState<Hit[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    setModels(null); setErr(null);
    const p = byMaker ? `maker=${encodeURIComponent(maker!)}` : `cat=${encodeURIComponent(cat ?? '')}&sub=${encodeURIComponent(sub ?? '')}`;
    api<{ models: Hit[] }>(`/api/models?${p}`).then(r => setModels(r.models)).catch(e => setErr(e.message));
  }, [byMaker, maker, cat, sub]);

  const title = byMaker ? maker! : sub!;
  const shown = useMemo(() => {
    const k = norm(q);
    return (models ?? []).filter(h => (!filter || (byMaker ? h.sub : h.maker) === filter) && (k.length < 1 || norm(`${h.maker}${h.model}`).includes(k)));
  }, [models, filter, q, byMaker]);
  const groups = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const h of shown) { const k = byMaker ? h.sub : h.maker; m.set(k, [...(m.get(k) ?? []), h]); }
    const order = new Map((facets?.items ?? []).map((f, i) => [f.name, i]));
    return [...m.entries()].sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999));
  }, [shown, byMaker, facets]);
  const setFilter = (f?: string) => go(url(byMaker ? { maker, f } : { cat, sub, f }), true);

  return (
    <>
      <Back label={byMaker ? '機材を追加' : cat ?? '機材を追加'} to="/add" />
      <h1 className="px-5 pt-2 text-[28px] font-bold leading-tight">{title}</h1>
      <p className="px-5 pt-1 text-[13px] text-sub">{models ? `${fmt(models.length)}機種` : ' '}</p>
      <SearchBox value={q} onChange={setQ} placeholder={`${title}の中で探す`} />
      {facets && facets.items.length > 1 && (
        <>
          <p className="px-5 pt-4 text-[13px] font-semibold text-sub">{byMaker ? '種類で絞る' : 'メーカーで絞る'}</p>
          <div className="flex gap-2 overflow-x-auto px-5 pb-1 pt-2 [scrollbar-width:none]">
            {[undefined, ...facets.items.map(f => f.name)].map(name => {
              const on = (filter ?? undefined) === name;
              return (
                <button key={name ?? '_all'} onClick={() => setFilter(name)} aria-pressed={on}
                  className={`h-[34px] shrink-0 rounded-full px-[13px] text-[14px] ${on ? 'bg-ink font-semibold text-white' : 'border-[1.2px] border-rule bg-white font-medium'}`}>
                  {name ?? 'すべて'}
                </button>
              );
            })}
          </div>
        </>
      )}
      {!models ? <Loading err={err} /> : shown.length === 0 ? <p className="px-5 pt-6 text-[14px] text-sub">見つかりませんでした。</p> : groups.map(([k, hs]) => (
        <section key={k}>
          <SectionTitle>{k}（{fmt(hs.length)}機種）</SectionTitle>
          <div className="flex flex-col gap-px">{hs.map(h => <ModelRow key={h.id} h={h} showSub={false} onPick={() => onPick(h)} />)}</div>
        </section>
      ))}
    </>
  );
}

/** 今の URL に合わせて、どの段を出すか決める */
export function Browse({ params, onPick, onManual }: { params: URLSearchParams; onPick: (h: Hit) => void; onManual?: () => void }) {
  const cat = params.get('cat') ?? undefined, sub = params.get('sub') ?? undefined, maker = params.get('maker') ?? undefined, f = params.get('f') ?? undefined;
  if (maker) return <List maker={maker} filter={f} onPick={onPick} />;
  if (cat && sub) return <List cat={cat} sub={sub} filter={f} onPick={onPick} />;
  if (cat) return <Genre cat={cat} onPick={onPick} />;
  return <Top by={params.get('by') === 'maker' ? 'maker' : 'genre'} onManual={onManual} />;
}
