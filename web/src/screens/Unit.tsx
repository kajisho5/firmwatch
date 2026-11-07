// S8 1台ごとの台帳（見る・直す・更新を記録する）
import { useEffect, useState } from 'react';
import { api, type Gear, type UpdateLog } from '../api';
import { Screen, Back, Lamp, SectionTitle, List, Button, ErrorNote, Field, inputCls, fmtDate, lampOf } from '../ui';
import { go } from '../router';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function Unit({ id }: { id: string }) {
  const [g, setG] = useState<Gear | null>(null);
  const [log, setLog] = useState<UpdateLog[]>([]);
  const [mode, setMode] = useState<'view' | 'edit' | 'record'>('view');
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = () => api<{ gear: Gear; updates: UpdateLog[] }>(`/api/gear/${id}`).then(r => { setG(r.gear); setLog(r.updates); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); setMode('view'); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!g) return <Screen><Back label="機材" to="/gear" /><ErrorNote text={err} /></Screen>;
  const back = g.model_id != null ? { label: g.model, to: `/models/${g.model_id}` } : { label: '機材', to: '/gear' };

  if (mode === 'edit') {
    return (
      <Screen>
        <Back label="やめる" to={`/gear/${id}`} />
        <h1 className="px-5 pt-2 text-[28px] font-bold">台帳を直す</h1>
        <p className="px-5 pt-1 text-[14px] text-sub">{g.maker} {g.model}</p>
        <Field label="管理番号"><input className={inputCls} value={form.asset_no ?? ''} onChange={set('asset_no')} placeholder="例：A-01" /></Field>
        <Field label="シリアル番号"><input className={inputCls} value={form.serial ?? ''} onChange={set('serial')} autoCapitalize="characters" /></Field>
        <Field label="購入日"><input type="date" className={inputCls} value={form.purchased_on ?? ''} onChange={set('purchased_on')} /></Field>
        <Field label="購入先"><input className={inputCls} value={form.purchased_from ?? ''} onChange={set('purchased_from')} /></Field>
        <Field label="今のバージョン" hint="更新したときは、台帳の画面の「更新したことを記録する」を使うと記録も残ります。"><input className={inputCls} value={form.current_version ?? ''} onChange={set('current_version')} inputMode="decimal" /></Field>
        <Field label="メモ"><textarea className={`${inputCls} h-24 py-3`} value={form.note ?? ''} onChange={set('note')} /></Field>
        <ErrorNote text={err} />
        <div className="space-y-3 px-5 pt-6">
          <Button disabled={busy} onClick={() => save(() => api(`/api/gear/${id}`, { method: 'PATCH', body: form }))}>保存する</Button>
          <Button kind="secondary" disabled={busy} onClick={async () => {
            if (!confirm('この台を消します。更新の記録も消えます。よろしいですか？')) return;
            setBusy(true);
            try { await api(`/api/gear/${id}`, { method: 'DELETE' }); go('/gear', true); } catch (e: any) { setErr(e.message); setBusy(false); }
          }}>この台を消す</Button>
        </div>
      </Screen>
    );
  }

  if (mode === 'record') {
    return (
      <Screen>
        <Back label="やめる" to={`/gear/${id}`} />
        <h1 className="px-5 pt-2 text-[28px] font-bold">更新したことを記録</h1>
        <p className="px-5 pt-1 text-[14px] text-sub">{g.asset_no || g.model}　今は {g.current_version || '未入力'}</p>
        <Field label="新しいバージョン"><input className={inputCls} value={form.to_version ?? ''} onChange={set('to_version')} inputMode="decimal" autoFocus /></Field>
        <Field label="更新した日"><input type="date" className={inputCls} value={form.updated_on ?? ''} onChange={set('updated_on')} /></Field>
        <Field label="メモ（任意）"><input className={inputCls} value={form.note ?? ''} onChange={set('note')} placeholder="例：本体のUSBから更新" /></Field>
        <ErrorNote text={err} />
        <div className="px-5 pt-6"><Button disabled={busy || !form.to_version?.trim()} onClick={() => save(() => api(`/api/gear/${id}/updates`, { body: form }))}>記録する</Button></div>
      </Screen>
    );
  }

  const rows: [string, string, boolean?][] = [
    ['管理番号', g.asset_no || '—'], ['シリアル番号', g.serial || '—'], ['購入日', g.purchased_on ? fmtDate(g.purchased_on) : '—'],
    ['購入先', g.purchased_from || '—'],
    ['今のバージョン', g.current_version ? (g.state === 'old' ? `${g.current_version}（最新は ${g.latest!.version}）` : g.current_version) : '未入力', g.state === 'old'],
    ['メモ', g.note || '—'],
  ];
  return (
    <Screen>
      <Back label={back.label} to={back.to} />
      <div className="flex items-center justify-between px-5 pt-2">
        <h1 className="flex items-center gap-3 text-[30px] font-bold leading-tight">{g.asset_no || g.model}<Lamp state={lampOf(g.state)} quiet={g.state !== 'old'} /></h1>
        <button className="min-h-[44px] px-1 text-[16px] font-semibold" onClick={() => {
          setForm({ asset_no: g.asset_no ?? '', serial: g.serial ?? '', purchased_on: g.purchased_on ?? '', purchased_from: g.purchased_from ?? '', current_version: g.current_version ?? '', note: g.note ?? '' });
          setMode('edit');
        }}>編集</button>
      </div>
      {g.asset_no && <p className="px-5 text-[14px] text-sub">{g.maker} {g.model}</p>}
      <ErrorNote text={err} />
      <div className="mt-4"><List>
        {rows.map(([k, v, red]) => (
          <div key={k} className="flex min-h-[46px] items-center justify-between gap-4 bg-panel px-5 py-2">
            <span className="flex-none text-[14px] text-sub">{k}</span>
            <span className={`min-w-0 text-right text-[15px] ${red ? 'font-semibold text-tally' : ''}`}>{v}</span>
          </div>
        ))}
      </List></div>
      <div className="px-5 pt-4"><Button onClick={() => { setForm({ to_version: g.latest?.version ?? '', updated_on: today() }); setMode('record'); }}>更新したことを記録する</Button></div>

      <SectionTitle>更新の記録</SectionTitle>
      {log.length === 0 && <p className="px-5 text-[14px] text-sub">まだ記録はありません。</p>}
      <List>
        {log.map(u => (
          <div key={u.id} className="bg-panel px-5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[16px] font-semibold">{u.from_version ? `${u.from_version} から ${u.to_version} へ` : `登録（${u.to_version}）`}</span>
              <span className="flex-none text-[13px] text-sub">{fmtDate(u.updated_on)}</span>
            </div>
            <p className="mt-1 text-[13px] text-faint">{u.recorded_by}が記録{u.note && u.note !== '登録時' ? `　${u.note}` : ''}</p>
          </div>
        ))}
      </List>
    </Screen>
  );
}
