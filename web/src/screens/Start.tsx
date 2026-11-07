// S0 はじめに：ホーム画面への追加の案内と、パスキーでのログイン
import { useState } from 'react';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from '../api';
import { Lamp, Button, ErrorNote, inputCls, SectionTitle, List } from '../ui';
import { isIOS, isStandalone } from '../push';

export function Start({ onDone }: { onDone: (recoveryCode?: string) => void }) {
  const [mode, setMode] = useState<'top' | 'new' | 'code'>('top');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canPasskey = browserSupportsWebAuthn();

  const run = (fn: () => Promise<void>) => async () => {
    setErr(null); setBusy(true);
    try { await fn(); } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? 'パスキーの操作が取り消されました。もう一度お試しください。' : e?.message || 'うまくいきませんでした。');
    } finally { setBusy(false); }
  };

  const login = run(async () => {
    const { options, ticket } = await api('/api/auth/login/options', { body: {} });
    const response = await startAuthentication({ optionsJSON: options });
    await api('/api/auth/login/verify', { body: { ticket, response } });
    onDone();
  });
  const register = run(async () => {
    const n = name.trim() || '名前なし';
    const { options, ticket } = await api('/api/auth/register/options', { body: { name: n } });
    const response = await startRegistration({ optionsJSON: options });
    const r = await api('/api/auth/register/verify', { body: { ticket, response, name: n } });
    onDone(r.recoveryCode);
  });
  const useCode = run(async () => {
    await api('/api/auth/recover', { body: { code } });
    onDone();
  });

  const showSteps = !isStandalone();
  const android = /Android/.test(navigator.userAgent);

  return (
    <div className="safe-top mx-auto min-h-dvh max-w-[560px] bg-case pb-10">
      <div className="flex items-center gap-3 px-5 pt-10">
        <Lamp state="red" w={30} h={20} className="lamp-blink" />
        <span className="text-[20px] font-bold tracking-[0.05em]">FIRMWATCH</span>
      </div>
      <h1 className="px-5 pt-8 text-[30px] font-bold leading-[1.33]">機材のファームを、<br />まとめて見張る。</h1>
      <p className="px-5 pt-4 text-[15px] leading-[1.6] text-sub">持っている機材を登録すると、ファームやソフトの新しいバージョンが出たときに通知します。</p>

      {showSteps && (
        <>
          <SectionTitle className="pt-8">先にホーム画面へ追加してください</SectionTitle>
          <List>
            {[
              android ? 'Chrome の右上のメニューを押す' : isIOS() ? '下の共有ボタンを押す' : 'ブラウザの共有ボタンかメニューを押す',
              '「ホーム画面に追加」を選ぶ',
              'ホーム画面のアイコンから開く',
            ].map((s, i) => (
              <div key={i} className="flex min-h-[55px] items-center gap-4 bg-panel px-5">
                <span className="w-3 text-[16px] font-bold text-faint">{i + 1}</span>
                <span className="text-[15px]">{s}</span>
              </div>
            ))}
          </List>
          {isIOS() && <p className="px-5 pt-3 text-[13px] text-sub">iPhone は、ホーム画面に追加したアプリだけが通知を受け取れます。</p>}
        </>
      )}

      <ErrorNote text={err} />

      {mode === 'top' && (
        <div className="space-y-3 px-5 pt-8">
          {!canPasskey && <p className="text-[14px] text-sub">このブラウザはパスキーに対応していません。Safari か Chrome で開いてください。</p>}
          <Button onClick={login} disabled={busy || !canPasskey}>パスキーでログイン</Button>
          <Button kind="secondary" onClick={() => { setErr(null); setMode('new'); }} disabled={busy || !canPasskey}>新しく始める</Button>
          <p className="pt-1 text-[13px] leading-[1.6] text-sub">パスワードもメールアドレスも要りません。顔認証や指紋でログインします。</p>
          <button className="min-h-[44px] text-[15px] font-semibold underline underline-offset-4" onClick={() => { setErr(null); setMode('code'); }}>引き継ぎコードで入る</button>
        </div>
      )}

      {mode === 'new' && (
        <div className="px-5 pt-8">
          <label className="block">
            <span className="mb-2 block text-[14px] font-semibold text-sub">表示する名前</span>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="例：テスト太郎" maxLength={40} autoComplete="nickname" />
          </label>
          <p className="pt-2 text-[13px] text-sub">更新の記録に「誰が記録したか」として残ります。</p>
          <div className="space-y-3 pt-6">
            <Button onClick={register} disabled={busy}>パスキーを作って始める</Button>
            <Button kind="secondary" onClick={() => setMode('top')} disabled={busy}>戻る</Button>
          </div>
        </div>
      )}

      {mode === 'code' && (
        <div className="px-5 pt-8">
          <label className="block">
            <span className="mb-2 block text-[14px] font-semibold text-sub">引き継ぎコード</span>
            <input className={`${inputCls} tracking-[0.08em]`} value={code} onChange={e => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
          </label>
          <p className="pt-2 text-[13px] text-sub">入ったあと、この端末用のパスキーを作れます。</p>
          <div className="space-y-3 pt-6">
            <Button onClick={useCode} disabled={busy || code.trim().length < 20}>入る</Button>
            <Button kind="secondary" onClick={() => setMode('top')} disabled={busy}>戻る</Button>
          </div>
        </div>
      )}
    </div>
  );
}
