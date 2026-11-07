// S3 機材を追加
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Screen, Back, SectionTitle, Button, ErrorNote, Field, inputCls } from '../ui';
import { go } from '../router';

interface Hit { id: number; maker: string; model: string; sub: string; discontinued: number; source_key: string | null; source_label: string | null; maker_url?: string | null }

export function AddGear() {
  const preset = new URLSearchParams(location.search).get('model');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [pick, setPick] = useState<Hit | null>(null);
  const [manual, setManual] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ count: '1' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number>(0);

  useEffect(() => {
    if (!preset) return;
    api(`/api/models/${preset}`).then(d => setPick({ id: d.model.id, maker: d.model.maker, model: d.model.model, sub: d.model.sub, discontinued: 0, source_key: d.model.source_key, source_label: d.model.source_label, maker_url: d.model.maker_url })).catch(() => {});
  }, [preset]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = window.setTimeout(() => {
      api<{ models: Hit[] }>(`/api/models?q=${encodeURIComponent(q)}`).then(r => setHits(r.models)).catch(e => setErr(e.message));
    }, 200);
  }, [q]);

  const set = (k: string) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));
  const add = async () => {
    setBusy(true); setErr(null);
    try {
      const body = manual ? { ...f, custom_maker: f.custom_maker, custom_model: f.custom_model } : { ...f, model_id: pick!.id };
      const r = await api<{ ids: string[] }>('/api/gear', { body: { ...body, count: Number(f.count) || 1 } });
      go(!manual && pick ? `/models/${pick.id}` : `/gear/${r.ids[0]}`, true);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  const groups = new Map<string, Hit[]>();
  for (const h of hits) groups.set(h.maker, [...(groups.get(h.maker) ?? []), h]);
  const ready = manual ? !!(f.custom_maker?.trim() && f.custom_model?.trim()) : !!pick;
  const count = Number(f.count) || 1;

  return (
    <Screen>
      <Back label="機材" to="/gear" />
      <h1 className="px-5 pt-2 text-[28px] font-bold">機材を追加</h1>

      {!manual && !pick && (
        <>
          <div className="px-5 pt-4">
            <label className="flex h-[48px] items-center gap-3 rounded-[6px] border-[1.5px] border-ink bg-white px-4 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ink">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden><circle cx="7.5" cy="7.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m12 12 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <input className="h-full min-w-0 flex-1 bg-transparent text-[16px] focus:outline-none focus-visible:outline-none" placeholder="機種名やメーカーで探す（例：ATEM Mini）" value={q} onChange={e => setQ(e.target.value)} autoFocus aria-label="機種を探す" />
            </label>
            <p className="pt-3 text-[13px] text-sub">12,592機種から探せます。無ければ<button className="font-semibold text-ink underline underline-offset-4" onClick={() => setManual(true)}>手で入力</button>できます。</p>
          </div>
          {q.trim().length >= 2 && hits.length === 0 && <p className="px-5 pt-6 text-[14px] text-sub">見つかりませんでした。型番の一部だけで探すか、手で入力してください。</p>}
          {[...groups.entries()].map(([maker, hs]) => (
            <section key={maker}>
              <SectionTitle>{maker}</SectionTitle>
              <div className="flex flex-col gap-px">
                {hs.map(h => (
                  <button key={h.id} onClick={() => { setPick(h); setErr(null); }} className="min-h-[59px] w-full bg-panel px-5 py-2.5 text-left active:bg-white">
                    <span className="block text-[16px] font-medium">{h.model}</span>
                    <span className="block text-[12.5px] text-sub">{h.sub}{h.discontinued ? '、生産終了' : ''}{h.source_key?.startsWith('bmd:') || h.source_key?.startsWith('os:') ? '' : h.source_key || h.maker_url ? '、製品ページで確認（推定）' : '、自動確認なし'}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {(pick || manual) && (
        <>
          {pick && !manual && (
            <div className="mt-4 flex items-center border-l-4 border-ink bg-white px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-sub">{pick.maker}</span>
                <span className="block text-[17px] font-bold">{pick.model}</span>
                <span className="block text-[12.5px] text-sub">{pick.source_key && !pick.source_key.startsWith('page:') ? `${pick.source_label} の新しいバージョンを自動で確認します` : pick.source_key || pick.maker_url ? 'メーカーの製品ページを見張り、載っているバージョンが変わったら知らせます（推定）' : 'この機種は自動では確認しません。更新は手で記録できます'}</span>
              </span>
              {!preset && <button className="min-h-[44px] pl-3 text-[15px] font-semibold" onClick={() => setPick(null)}>変える</button>}
            </div>
          )}
          {manual && (
            <>
              <Field label="メーカー"><input className={inputCls} value={f.custom_maker ?? ''} onChange={set('custom_maker')} autoFocus /></Field>
              <Field label="機種名"><input className={inputCls} value={f.custom_model ?? ''} onChange={set('custom_model')} /></Field>
              <p className="px-5 pt-2 text-[13px] text-sub">手で入れた機種は、自動では確認しません。</p>
            </>
          )}
          <Field label="台数"><input className={inputCls} value={f.count} onChange={set('count')} inputMode="numeric" /></Field>
          {count === 1 && <Field label="管理番号（任意）"><input className={inputCls} value={f.asset_no ?? ''} onChange={set('asset_no')} placeholder="例：A-01" /></Field>}
          <Field label="今のバージョン（分かれば）" hint="入れておくと、上げ忘れている台も知らせます。"><input className={inputCls} value={f.current_version ?? ''} onChange={set('current_version')} inputMode="decimal" /></Field>
          <Field label="購入日（任意）"><input type="date" className={inputCls} value={f.purchased_on ?? ''} onChange={set('purchased_on')} /></Field>
          {count > 1 && <p className="px-5 pt-3 text-[13px] text-sub">管理番号とシリアル番号は、追加したあと1台ずつ入れてください。</p>}
          <ErrorNote text={err} />
          <div className="space-y-3 px-5 pt-6">
            <Button disabled={busy || !ready} onClick={add}>{count > 1 ? `${count}台を追加する` : '追加する'}</Button>
            {manual && <Button kind="secondary" onClick={() => setManual(false)}>一覧から探す</Button>}
          </div>
        </>
      )}
    </Screen>
  );
}
