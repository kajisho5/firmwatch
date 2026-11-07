// 新しい版への切り替え（iPhone のホーム画面アプリは古い版が残りやすいので、こちらから確かめる）
import { registerSW } from 'virtual:pwa-register';

declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;
(window as any).__FW_BUILD__ = BUILD_ID; // 試験で今の版を確かめるため

let apply: ((reload?: boolean) => Promise<void>) | null = null;
let reg: ServiceWorkerRegistration | undefined;
let pending = false;
const listeners = new Set<(v: boolean) => void>();
const announce = () => listeners.forEach(l => l(pending));

/** 入力の途中かどうか（途中なら勝手に読み込み直さない） */
function typing() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function applyUpdate() { void apply?.(true); }
export function onUpdateAvailable(fn: (v: boolean) => void) { listeners.add(fn); fn(pending); return () => listeners.delete(fn); }

/** 公開されている版の番号を確かめ、違えば新しい版を取りにいく */
async function check() {
  try {
    await reg?.update();
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== BUILD_ID) {
      await reg?.update();
      // サービスワーカーが使えない環境では、そのまま読み込み直す
      if (!('serviceWorker' in navigator) && !typing()) location.reload();
    }
  } catch { /* 電波がないときは何もしない */ }
}

export function startUpdates() {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true; announce();
      if (!typing() && document.visibilityState === 'visible') applyUpdate();
    },
    onRegisteredSW(_url, r) {
      reg = r;
      void check();
      setInterval(check, 30 * 60_000);
    },
  });
  // アプリを前に出したとき（ほかのアプリから戻ったときも）に確かめる
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pending && !typing()) applyUpdate(); else void check();
  });
  window.addEventListener('focus', () => void check());
}
