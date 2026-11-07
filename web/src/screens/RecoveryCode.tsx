// 引き継ぎコードを見せる画面（作ったときに一度だけ）
import { useState } from 'react';
import { Button } from '../ui';

export function RecoveryCode({ code, onDone, again = false }: { code: string; onDone: () => void; again?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="safe-top mx-auto min-h-dvh max-w-[560px] bg-case px-5 pb-10">
      <h1 className="pt-12 text-[26px] font-bold leading-snug">引き継ぎコードを<br />保存してください</h1>
      <p className="pt-4 text-[15px] leading-[1.7] text-sub">
        端末を失くしたり機種変更したりしてパスキーが使えないときに、このコードで入れます。{again ? '前のコードは使えなくなりました。' : ''}この画面を閉じると、もう表示できません。
      </p>
      <p className="mt-6 select-all break-all bg-white px-4 py-5 text-center text-[22px] font-bold tracking-[0.08em]">{code}</p>
      <div className="space-y-3 pt-5">
        <Button kind="secondary" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { /* 手で写してもらう */ } }}>{copied ? 'コピーしました' : 'コピーする'}</Button>
        <Button onClick={onDone}>保存したので次へ</Button>
      </div>
      <p className="pt-4 text-[13px] text-sub">パスワード管理アプリやメモに貼っておくと安心です。</p>
    </div>
  );
}
