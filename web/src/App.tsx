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
import { onUpdateAvailable, applyUpdate } from './update';

function UpdateBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => { const off = onUpdateAvailable(setOn); return () => { off(); }; }, []);
  if (!on) return null;
  return (
    <div role="status" className="safe-top fixed inset-x-0 top-0 z-20 mx-auto flex max-w-[560px] items-center gap-3 bg-ink px-5 pb-3 text-white">
      <span className="flex-1 text-[14px]">新しい版があります</span>
      <button onClick={applyUpdate} className="min-h-[40px] rounded-[6px] bg-white px-4 text-[14px] font-semibold text-ink">更新する</button>
    </div>
  );
}

export function App() {
  return <><UpdateBanner /><Main /></>;
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
