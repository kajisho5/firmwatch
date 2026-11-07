// 新しいバージョンへの切り替え（iPhone のホーム画面アプリは古いバージョンが残りやすいので、こちらから確かめる）
//
// - 開いたとき・ほかのアプリから戻ったときに見つかった → 画面を見ていない間なので、そのまま切り替え、
//   切り替えたあとに「○○ に更新しました」を出す（設計 15章 T2）
// - 使っている途中に見つかった、または入力の途中 → 勝手に読み込み直さず「新しいバージョンがあります」を出す（T1）
//
// 切り替えの判断は自前で行う。vite-plugin-pwa（中身は workbox-window）の知らせは、
// 登録から60秒たった後や2回目以降に見つかった更新を「外から来たもの」として扱い、
// 同じ画面を開いたままだと2回目以降の更新を見落とすため。
import { registerSW } from 'virtual:pwa-register';

declare const __BUILD_ID__: string;
export const BUILD_ID = __BUILD_ID__;
(window as any).__FW_BUILD__ = BUILD_ID; // 試験で今のバージョンを確かめるため
(window as any).__FW_IN_USE__ = () => { quietUntil = 0; }; // 試験で「使っている途中」を作るため

/** 画面に出すバージョンの番号（ビルドの日時は除く） */
export const shortVersion = (b: string) => b.split('-')[0];

export interface UpdateState {
  /** 新しいバージョンが待っている（T1 を出す） */
  pending: boolean;
  /** 新しいバージョンの番号（分かれば） */
  next: string | null;
  /** さっき切り替わったバージョン（T2 を出す） */
  updated: string | null;
  /** T1 を ✕ で閉じた */
  dismissed: boolean;
}

const KEY = 'fw_updated_from';
let reg: ServiceWorkerRegistration | undefined;
let switching = false;
let quietUntil = 0; // この時刻までに見つかった更新は「開いたとき・戻ったとき」とみなす
let state: UpdateState = { pending: false, next: null, updated: null, dismissed: false };
const listeners = new Set<(s: UpdateState) => void>();
const set = (s: Partial<UpdateState>) => { state = { ...state, ...s }; listeners.forEach(l => l(state)); };

export function onUpdate(fn: (s: UpdateState) => void) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
export function dismissUpdate() { set({ dismissed: true }); }
export function clearUpdated() { set({ updated: null }); }

/** 入力の途中かどうか（途中なら勝手に読み込み直さない） */
function typing() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** 待機中の新しいサービスワーカーに切り替えて読み込み直す */
export function applyUpdate() {
  try { sessionStorage.setItem(KEY, BUILD_ID); } catch { /* 使えない環境では知らせを出さないだけ */ }
  const w = reg?.waiting;
  if (!w) { location.reload(); return; }
  switching = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  // 古いサービスワーカーが処理中だと入れ替わりが遅れることがある。
  // 画面の入口は毎回ネットから取るので、少し待って入れ替わらなければそのまま読み込み直す
  setTimeout(() => location.reload(), 3000);
}

const quiet = () => Date.now() < quietUntil && document.visibilityState === 'visible' && !typing();

/** 新しいバージョンが待機していれば、開いたときなら切り替え、使っている途中なら知らせる */
function noticeWaiting() {
  if (!reg?.waiting || !navigator.serviceWorker.controller) return; // 初めての取り込みは「更新」ではない
  if (quiet()) { applyUpdate(); return; }
  if (!state.pending) set({ pending: true, dismissed: false });
}

function watch(r: ServiceWorkerRegistration) {
  reg = r;
  r.addEventListener('updatefound', () => {
    const sw = r.installing;
    sw?.addEventListener('statechange', () => { if (sw.state === 'installed') noticeWaiting(); });
  });
  noticeWaiting(); // 開いた時点ですでに待機していた場合
}

/** 公開されているバージョンを確かめ、違えば新しいバージョンを取りにいく */
async function check() {
  try {
    await reg?.update();
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = (await r.json()) as { build?: string };
    if (build && build !== BUILD_ID) {
      set({ next: shortVersion(build) });
      await reg?.update();
      noticeWaiting();
      // サービスワーカーが使えない環境では、開いたときならそのまま読み込み直し、途中なら知らせる
      if (!('serviceWorker' in navigator)) { if (quiet()) applyUpdate(); else set({ pending: true }); }
    }
  } catch { /* 電波がないときは何もしない */ }
}

/** 開いたとき・戻ったとき：少しの間に見つかった更新はそのまま切り替える */
function opened() {
  quietUntil = Date.now() + 20_000;
  if (state.pending && !typing()) { applyUpdate(); return; }
  void check();
}

export function startUpdates() {
  // さっき切り替えたなら「更新しました」を出す
  try {
    const from = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (from && from !== BUILD_ID) state.updated = shortVersion(BUILD_ID);
  } catch { /* 無視 */ }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (switching) location.reload(); });
  }
  quietUntil = Date.now() + 20_000;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return;
      watch(r);
      void check();
      setInterval(check, 30 * 60_000);
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') opened(); });
  window.addEventListener('focus', () => void check()); // 使っている途中の確認（見つかったら知らせる）
}
