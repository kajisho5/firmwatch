// 通知が届かない状態のときだけ、一覧の上に出す案内
import { useEffect, useState } from 'react';
import { currentSubscription, enablePush, pushSupport } from '../push';
import { Button } from '../ui';

export function PushBanner() {
  const [state, setState] = useState<'checking' | 'on' | 'off' | 'needs-home' | 'unsupported' | 'denied'>('checking');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const s = pushSupport();
    if (s !== 'ok') { setState(s); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    currentSubscription().then(sub => setState(sub ? 'on' : 'off')).catch(() => setState('off'));
  }, []);

  if (state === 'checking' || state === 'on' || state === 'unsupported') return null;
  return (
    <div className="mx-0 mt-3 bg-tally-soft px-5 py-4">
      <p className="text-[15px] font-bold">通知が止まっています</p>
      <p className="mt-1 text-[13px] leading-[1.6] text-sub">
        {state === 'needs-home' && 'iPhone では、ホーム画面に追加したアイコンから開くと通知を受け取れます。共有ボタンから「ホーム画面に追加」を選んでください。'}
        {state === 'denied' && '通知が許可されていません。端末の「設定」で、このアプリの通知をオンにしてください。'}
        {state === 'off' && '新しいバージョンが出たときに知らせるには、通知をオンにしてください。'}
      </p>
      {state === 'off' && (
        <Button className="mt-3" onClick={async () => { setErr(null); try { await enablePush(); setState('on'); } catch (e: any) { setErr(e.message); } }}>通知をオンにする</Button>
      )}
      {err && <p role="alert" className="mt-2 text-[13px] text-tally">{err}</p>}
    </div>
  );
}
