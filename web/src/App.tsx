import { useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { useLocation, go } from './router';
import { Start } from './screens/Start';
import { Updates } from './screens/Updates';
import { GearList } from './screens/GearList';
import { ModelDetail } from './screens/ModelDetail';
import { Unit } from './screens/Unit';
import { AddGear } from './screens/AddGear';
import { Export } from './screens/Export';
import { Settings } from './screens/Settings';
import { RecoveryCode } from './screens/RecoveryCode';
import { onUpdate, applyUpdate, dismissUpdate, clearUpdated, shortVersion, BUILD_ID, type UpdateState } from './update';

/** アプリ自体の更新のお知らせ（設計 15章 T1・T2） */
function UpdateToast() {
  const [st, setSt] = useState<UpdateState | null>(null);
  useEffect(() => { const off = onUpdate(setSt); return () => { off(); }; }, []);
  useEffect(() => {
    if (!st?.updated) return;
    const t = setTimeout(clearUpdated, 4000);
    return () => clearTimeout(t);
  }, [st?.updated]);
  if (!st) return null;
  const pos = 'fixed inset-x-0 z-30 mx-auto max-w-[560px] px-3';
  const style = { bottom: 'calc(env(safe-area-inset-bottom) + 88px)' };
  const box = 'flex items-center gap-3 rounded-[10px] bg-[#16191C] text-white shadow-[0_3px_0_rgba(0,0,0,.18)]';
  if (st.pending && !st.dismissed) {
    return (
      <div role="status" className={pos} style={style}>
        <div className={`${box} py-3 pl-4 pr-1`}>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">新しいバージョンがあります</span>
            {st.next && <span className="block text-[12.5px] text-[#AEB4BA]">{shortVersion(BUILD_ID)} → {st.next}</span>}
          </span>
          <button onClick={applyUpdate} className="min-h-[36px] rounded-[6px] bg-white px-3 text-[14px] font-bold text-ink">更新する</button>
          <button onClick={dismissUpdate} aria-label="閉じる" className="grid h-[44px] w-[40px] place-items-center text-[#AEB4BA]">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    );
  }
  if (st.updated) {
    return (
      <div role="status" className={pos} style={style}>
        <div className={`${box} min-h-[52px] px-4 text-[15px] font-semibold`}>{st.updated} に更新しました</div>
      </div>
    );
  }
  return null;
}

export function App() {
  return <><UpdateToast /><Main /></>;
}

function Main() {
  const loc = useLocation();
  const [auth, setAuth] = useState<'checking' | 'in' | 'out'>('checking');
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    api('/api/me').then(() => setAuth('in')).catch(e => setAuth(e instanceof ApiError && e.status === 0 ? 'in' : 'out'));
  }, []);

  if (auth === 'checking') return <div className="min-h-dvh bg-case" />;
  if (auth === 'out') return <Start onDone={c => { if (c) setCode(c); setAuth('in'); go('/', true); }} />;
  if (code) return <RecoveryCode code={code} onDone={() => setCode(null)} />;

  const path = loc.split('?')[0];
  let m: RegExpMatchArray | null;
  if (path === '/gear') return <GearList />;
  if ((m = path.match(/^\/gear\/([\w-]+)$/))) return <Unit key={m[1]} id={m[1]} />;
  if ((m = path.match(/^\/models\/(\d+)$/))) return <ModelDetail key={m[1]} id={m[1]} />;
  if (path === '/add') return <AddGear />;
  if (path === '/export') return <Export />;
  if (path === '/settings') return <Settings onLogout={() => { try { localStorage.clear(); } catch { /* 無視 */ } setAuth('out'); }} />;
  return <Updates />;
}
