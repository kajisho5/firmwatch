// S1 更新の一覧（ホーム）
import { useEffect, useState } from 'react';
import { api, cache, type Alert } from '../api';
import { Screen, Header, Lamp, Empty, ErrorNote, ago } from '../ui';
import { go } from '../router';
import { PushBanner } from './PushBanner';

export function Updates() {
  const tabParam = new URLSearchParams(location.search).get('tab') === 'later' ? 'later' : 'now';
  const [tab, setTab] = useState<'now' | 'later'>(tabParam);
  const [alerts, setAlerts] = useState<Alert[] | null>(cache.get('alerts'));
  const [err, setErr] = useState<string | null>(null);

  const load = () => api<{ alerts: Alert[] }>('/api/alerts').then(r => { setAlerts(r.alerts); cache.set('alerts', r.alerts); setErr(null); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const list = (alerts ?? []).filter(a => a.severity === tab);
  const unread = (s: 'now' | 'later') => (alerts ?? []).filter(a => a.severity === s && !a.read_at).length;
  const nNow = unread('now'), nLater = unread('later');

  const markRead = async (a: Alert) => {
    if (a.read_at) return;
    setAlerts(prev => prev?.map(x => (x.id === a.id ? { ...x, read_at: Date.now() } : x)) ?? null);
    await api(`/api/alerts/${a.id}/read`, { body: {} }).catch(() => {});
  };
  const readAll = async () => {
    setAlerts(prev => prev?.map(x => (x.severity === tab ? { ...x, read_at: x.read_at ?? Date.now() } : x)) ?? null);
    await api('/api/alerts/read-all', { body: { severity: tab } }).catch(() => {});
  };

  return (
    <Screen tab={0}>
      <Header title="更新" right={nNow > 0 && (
        <span className="relative inline-flex h-[34px] min-w-[74px] items-center justify-center px-3" aria-label={`確認が要る更新 ${nNow}件`}>
          <Lamp state="red" w={74} h={34} className="absolute inset-0" />
          <span className="relative text-[18px] font-bold text-white">{nNow}件</span>
        </span>
      )} />
      <div className="flex gap-7 border-b border-rule px-5 pt-3" role="tablist">
        {([['now', '確認が要る', nNow], ['later', 'あとで見る', nLater]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); history.replaceState(null, '', k === 'later' ? '/?tab=later' : '/'); }}
            className={`relative min-h-[44px] pb-2 text-[16px] ${tab === k ? 'font-bold text-ink' : 'font-medium text-faint'}`}>
            {label}{n > 0 && tab !== k ? ` ${n}件` : ''}
            {tab === k && <span className="absolute bottom-[-1px] left-0 h-[3px] w-full bg-ink" />}
          </button>
        ))}
      </div>

      <PushBanner />
      <ErrorNote text={err} />

      {alerts && list.length === 0 && (
        tab === 'now'
          ? <Empty title="確認が要る更新はありません">機材を登録しておくと、新しいバージョンが出たときにここに出ます。<br /><button className="mt-3 font-semibold text-ink underline underline-offset-4" onClick={() => go('/gear')}>機材を見る</button></Empty>
          : <Empty title="あとで見る更新はありません">機能の追加など、急がない更新はここにたまり、週に1回まとめて通知します。</Empty>
      )}

      <div className="mt-2 flex flex-col gap-2">
        {list.map(a => {
          const dim = !!a.read_at;
          return (
            <article key={a.id} className={`flex gap-4 px-4 py-4 ${dim ? 'bg-[#E4E7EA]' : 'bg-panel'}`} onClick={() => markRead(a)}>
              <Lamp state={dim ? 'off' : 'red'} w={8} h="stretch" quiet={dim} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className={`text-[18px] font-bold leading-snug ${dim ? 'text-sub' : ''}`}>{a.is_os ? `${a.title} が公開` : a.models.length ? a.models.join('、') : a.source_label}</h2>
                  <span className="flex-none text-[13px] text-faint">{ago(a.created_at)}</span>
                </div>
                {!a.is_os && (
                  <p className={`mt-1 text-[15px] ${dim ? 'text-faint' : 'text-sub'}`}>
                    {a.from && <>{a.from} <span className="text-faint">→</span> </>}<b className={dim ? '' : 'text-ink'}>{a.version}</b>
                    <span className="ml-2 text-[13px] text-faint">{a.source_label}</span>
                  </p>
                )}
                <p className={`mt-1.5 text-[14px] leading-[1.6] ${dim ? 'text-faint' : 'text-sub'}`}>
                  {a.is_os ? `操作ソフトを使う機材が${a.units}台あります。対応を確かめてから上げてください。` : a.notes}
                </p>
                <div className="mt-2 flex gap-5">
                  <a href={a.url} target="_blank" rel="noopener" className="inline-flex min-h-[40px] items-center text-[14px] font-semibold underline underline-offset-4" onClick={e => e.stopPropagation()}>公開ページを開く</a>
                  {!dim && <button className="min-h-[40px] text-[14px] font-semibold text-sub" onClick={e => { e.stopPropagation(); markRead(a); }}>確認した</button>}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {list.some(a => !a.read_at) && (
        <button onClick={readAll} className="mx-5 mt-4 min-h-[44px] text-[14px] font-semibold text-sub underline underline-offset-4">すべて確認済みにする</button>
      )}
      {list.length > 0 && (
        <p className="px-5 pt-6 text-[13px] leading-[1.6] text-sub">赤いランプは、まだ確認していない更新です。<br />確認が要るかどうかは、更新内容の文言から自動で決めています。</p>
      )}
    </Screen>
  );
}
