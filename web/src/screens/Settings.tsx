// S6 設定
import { useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { api, type Me } from '../api';
import { Screen, Header, SectionTitle, List, Toggle, ErrorNote, Button, Chevron } from '../ui';
import { currentSubscription, enablePush, disablePush, pushSupport, deviceLabel } from '../push';
import { RecoveryCode } from './RecoveryCode';

const WEEK = ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'];

export function Settings({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [here, setHere] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const support = pushSupport();

  const load = () => api<Me>('/api/me').then(setMe).catch(e => setErr(e.message));
  useEffect(() => {
    load();
    currentSubscription().then(s => setHere(!!s)).catch(() => setHere(false));
  }, []);

  const patch = async (b: Record<string, unknown>) => {
    setMe(m => (m ? { ...m, user: { ...m.user, ...b } as Me['user'] } : m));
    await api('/api/me', { method: 'PATCH', body: b }).catch(e => setErr(e.message));
  };
  const togglePush = async (on: boolean) => {
    setErr(null);
    try { if (on) await enablePush(); else await disablePush(); setHere(on); load(); } catch (e: any) { setErr(e.message); }
  };

  if (code) return <RecoveryCode code={code} onDone={() => setCode(null)} again />;
  const u = me?.user;
  const others = (me?.pushSubs.length ?? 0) - (here ? 1 : 0);

  return (
    <Screen tab={2}>
      <Header title="設定" />
      <ErrorNote text={err} />
      {u && (
        <>
          <SectionTitle className="pt-3">通知</SectionTitle>
          <List>
            <div className="flex min-h-[53px] items-center gap-3 bg-panel px-5 py-2">
              <span className="flex-1">
                <span className="block text-[15px]">この{deviceLabel()}に通知</span>
                <span className="block text-[12px] text-sub">
                  {support === 'needs-home' ? 'ホーム画面に追加したアイコンから開くと使えます' : support === 'unsupported' ? 'このブラウザでは使えません' : here ? '受け取っています' : 'オフ'}
                </span>
              </span>
              {support === 'ok' && <Toggle on={!!here} onChange={togglePush} label="この端末に通知" />}
            </div>
            <div className="flex min-h-[53px] items-center bg-panel px-5 py-2">
              <span className="flex-1">
                <span className="block text-[15px]">ほかの端末</span>
                <span className="block text-[12px] text-sub">{others > 0 ? `${others}台で受け取っています。` : 'ありません。'}ほかの端末でこのアプリを開いて通知をオンにすると増えます</span>
              </span>
            </div>
          </List>

          <SectionTitle>確認が要る更新</SectionTitle>
          <div className="flex min-h-[53px] items-center bg-panel px-5"><span className="flex-1 text-[15px]">届け方</span><span className="text-[14px] text-sub">見つけたらすぐ通知</span></div>

          <SectionTitle>あとで見る更新</SectionTitle>
          <div className="flex min-h-[53px] items-center gap-2 bg-panel px-5">
            <span className="flex-1 text-[15px]">まとめて通知する日時</span>
            <select aria-label="曜日" className="h-[40px] rounded-[6px] border border-rule bg-white px-2 text-[14px]" value={u.digest_weekday} onChange={e => patch({ digest_weekday: Number(e.target.value) })}>
              {WEEK.map((w, i) => <option key={i} value={i}>毎週{w}</option>)}
            </select>
            <select aria-label="時刻" className="h-[40px] rounded-[6px] border border-rule bg-white px-2 text-[14px]" value={u.digest_hour} onChange={e => patch({ digest_hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}時</option>)}
            </select>
          </div>

          <SectionTitle>OSの新しいバージョンを知らせる</SectionTitle>
          <List>
            {([['os_macos', 'macOS'], ['os_windows', 'Windows'], ['os_ipados', 'iPadOS']] as const).map(([k, l]) => (
              <div key={k} className="flex min-h-[53px] items-center bg-panel px-5">
                <span className="flex-1 text-[15px]">{l}</span>
                <Toggle on={!!u[k]} onChange={v => patch({ [k]: v ? 1 : 0 })} label={`${l}の新しいバージョンを知らせる`} />
              </div>
            ))}
          </List>
          <p className="px-5 pt-2 text-[12.5px] leading-[1.6] text-sub">操作ソフトを使う機材（スイッチャー、ミキサーなど）を登録している場合に知らせます。</p>

          <SectionTitle>ログイン</SectionTitle>
          <List>
            <button className="flex min-h-[53px] w-full items-center bg-panel px-5 text-left active:bg-white" onClick={async () => {
              setErr(null); setNote(null);
              try {
                const { options, ticket } = await api('/api/me/passkey/options', { body: {} });
                const response = await startRegistration({ optionsJSON: options });
                await api('/api/me/passkey/verify', { body: { ticket, response } });
                setNote('この端末のパスキーを追加しました。'); load();
              } catch (e: any) { setErr(e?.name === 'NotAllowedError' ? 'パスキーの操作が取り消されました。' : e.message); }
            }}>
              <span className="flex-1"><span className="block text-[15px]">この端末のパスキーを追加</span><span className="block text-[12px] text-sub">登録済み {me?.passkeys ?? 0} 個</span></span><Chevron />
            </button>
            <button className="flex min-h-[53px] w-full items-center bg-panel px-5 text-left active:bg-white" onClick={async () => {
              if (!confirm('新しい引き継ぎコードを作ります。前のコードは使えなくなります。よろしいですか？')) return;
              try { setCode((await api('/api/me/recovery', { body: {} })).recoveryCode); } catch (e: any) { setErr(e.message); }
            }}>
              <span className="flex-1 text-[15px]">引き継ぎコードを作り直す</span><Chevron />
            </button>
          </List>
          {note && <p className="px-5 pt-2 text-[13px] text-go">{note}</p>}

          <div className="mt-6 flex min-h-[53px] items-center bg-panel px-5">
            <span className="flex-1 text-[15px]">{u.name}</span>
            <button className="min-h-[44px] text-[15px] font-semibold text-tally" onClick={async () => { await api('/api/auth/logout', { body: {} }).catch(() => {}); onLogout(); }}>ログアウト</button>
          </div>
          <div className="px-5 pt-8 text-[12px] leading-[1.7] text-faint">
            <p>自動で確認しているメーカー：Blackmagic Design（そのほかは順次）。OS：macOS、iPadOS、Windows 11。</p>
            <p>Roland はメーカーのサイトが機械での読み取りを認めていないため、自動では確認していません。</p>
          </div>
        </>
      )}
      {!u && !err && <div className="px-5 pt-4"><Button kind="secondary" disabled>読み込み中</Button></div>}
    </Screen>
  );
}
