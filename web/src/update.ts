// 新しいバージョンへの切り替え（iPhone のホーム画面アプリは古いバージョンが残りやすいので、こちらから確かめる）
//
// 切り替えの判断は自前で行う。vite-plugin-pwa（中身は workbox-window）の知らせは、
// 登録から60秒たった後や2回目以降に見つかった更新を「外から来たもの」として扱い、
// 同じ画面を開いたままだと2回目以降の更新を見落とすため。
import { registerSW } from 'virtual:pwa-register';

declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;
(window as any).__FW_BUILD__ = BUILD_ID; // 試験で今のバージョンを確かめるため

let reg: ServiceWorkerRegistration | undefined;
let pending = false;
let switching = false;
const listeners = new Set<(v: boolean) => void>();
const announce = () => listeners.forEach(l => l(pending));

/** 入力の途中かどうか（途中なら勝手に読み込み直さない） */
function typing() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** 待機中の新しいサービスワーカーに切り替える。切り替わったら読み込み直す（controllerchange） */
export function applyUpdate() {
  const w = reg?.waiting;
  if (!w) { if (pending) location.reload(); return; }
  switching = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  // 古いサービスワーカーが処理中だと入れ替わりが遅れることがある。
  // 画面の入口は毎回ネットから取るので、少し待って入れ替わらなければそのまま読み込み直す
  setTimeout(() => location.reload(), 3000);
}
export function onUpdateAvailable(fn: (v: boolean) => void) { listeners.add(fn); fn(pending); return () => listeners.delete(fn); }

/** 新しいバージョンが待機しているか確かめ、待機していれば（入力中でなければ）切り替える */
function noticeWaiting() {
  if (!reg?.waiting || !navigator.serviceWorker.controller) return; // 初めての取り込みは「更新」ではない
  if (!pending) { pending = true; announce(); }
  if (!typing() && document.visibilityState === 'visible') applyUpdate();
}

function watch(r: ServiceWorkerRegistration) {
  reg = r;
  r.addEventListener('updatefound', () => {
    const sw = r.installing;
    sw?.addEventListener('statechange', () => { if (sw.state === 'installed') noticeWaiting(); });
  });
  noticeWaiting(); // 開いた時点ですでに待機していた場合
}

/** 公開されているバージョンの番号を確かめ、違えば新しいバージョンを取りにいく */
async function check() {
  try {
    await reg?.update();
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== BUILD_ID) {
      await reg?.update();
      noticeWaiting();
      // サービスワーカーが使えない環境では、そのまま読み込み直す
      if (!('serviceWorker' in navigator) && !typing()) location.reload();
    }
  } catch { /* 電波がないときは何もしない */ }
}

export function startUpdates() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (switching) location.reload();
    });
  }
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return;
      watch(r);
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
