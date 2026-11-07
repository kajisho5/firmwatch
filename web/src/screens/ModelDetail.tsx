// S4 機種の詳細
import { useEffect, useState } from 'react';
import { api, type Gear } from '../api';
import { Screen, Back, Lamp, SectionTitle, List, Chevron, Button, ErrorNote, fmtDate, lampOf } from '../ui';
import { go } from '../router';

interface Detail {
  model: { id: number; maker: string; model: string; sub: string; maker_url: string | null; source_key: string | null; source_label: string | null; page_url: string | null; source_ok: number | null; checked_at: number | null };
  releases: { version: string; title: string; released_at: number | null; notes: string; url: string; severity: string }[];
  units: Gear[];
}

export function ModelDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<Detail>(`/api/models/${id}`).then(setD).catch(e => setErr(e.message)); }, [id]);

  const latest = d?.releases[0];
  return (
    <Screen>
      <Back label="機材" to="/gear" />
      <ErrorNote text={err} />
      {d && (
        <>
          <h1 className="px-5 pt-2 text-[28px] font-bold leading-tight">{d.model.model}</h1>
          <p className="px-5 pt-1 text-[14px] text-sub">{d.model.maker} の{d.model.sub}</p>

          <div className="mt-4 bg-panel px-5 py-4">
            {latest ? (
              <>
                <p className="text-[13px] text-sub">公開されている最新{d.model.source_label ? `（${d.model.source_label}）` : ''}</p>
                <p className="mt-1 flex items-baseline gap-4"><span className="text-[32px] font-bold leading-none">{latest.version}</span>
                  {latest.released_at && <span className="text-[14px] text-sub">{fmtDate(latest.released_at)}に公開</span>}</p>
              </>
            ) : d.model.source_key ? (
              <p className="text-[14px] text-sub">{d.model.source_ok === 0 ? 'メーカーの公開ページを読めず、確認が止まっています。' : 'まだ確認していません。次の定期チェック（6時間ごと）で分かります。'}</p>
            ) : (
              <p className="text-[14px] leading-[1.6] text-sub">この機種は自動では確認していません。メーカーが機械での読み取りを認めていないか、まだ対応していないためです。更新したときは、各台の画面から記録できます。</p>
            )}
          </div>
          {(d.model.page_url || d.model.maker_url) && (
            <div className="px-5 pt-3"><a href={d.model.page_url || d.model.maker_url!} target="_blank" rel="noopener"><Button>メーカーの{d.model.page_url ? '更新' : '製品'}ページを開く</Button></a></div>
          )}

          <SectionTitle>手持ちの{d.units.length}台</SectionTitle>
          <List>
            {d.units.map(u => (
              <button key={u.id} onClick={() => go(`/gear/${u.id}`)} className="flex min-h-[71px] w-full items-center gap-4 bg-panel px-5 py-2.5 text-left active:bg-white">
                <Lamp state={lampOf(u.state)} quiet={u.state !== 'old'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-3">
                    <span className="text-[17px] font-bold">{u.asset_no || '番号なし'}</span>
                    <span className={`text-[15px] ${u.state === 'old' ? 'font-semibold text-tally' : 'text-sub'}`}>
                      {u.current_version ? (u.state === 'old' ? `${u.current_version} のまま` : u.state === 'ok' ? `${u.current_version} に更新済み` : u.current_version) : '今のバージョン未入力'}
                    </span>
                  </span>
                  <span className="block text-[13px] text-sub">
                    {[u.purchased_on && `${fmtDate(u.purchased_on).replace(/\d+日$/, '')}購入`, u.last_updated_on && `最後の更新 ${fmtDate(u.last_updated_on).replace(/\d+日$/, '')}`].filter(Boolean).join('、') || '購入日・更新日は未入力'}
                  </span>
                </span>
                <Chevron />
              </button>
            ))}
          </List>
          <div className="px-5 pt-3"><Button kind="secondary" onClick={() => go(`/add?model=${d.model.id}`)}>この機種をもう1台追加</Button></div>

          {d.releases.length > 0 && (
            <>
              <SectionTitle>公開されたバージョン</SectionTitle>
              <List>
                {d.releases.map(r => (
                  <details key={r.version} className="bg-panel">
                    <summary className="flex min-h-[51px] cursor-pointer list-none items-center gap-4 px-5">
                      <span className="w-[72px] flex-none text-[16px] font-bold">{r.version}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-sub">{r.title}</span>
                      <span className="flex-none text-[13px] text-faint">{r.released_at ? fmtDate(r.released_at, 'short') : ''}</span>
                    </summary>
                    <p className="px-5 pb-4 text-[14px] leading-[1.7] text-sub">{r.notes || '内容の説明はありません。'}</p>
                  </details>
                ))}
              </List>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
