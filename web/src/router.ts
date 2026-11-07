// 画面の切り替え（URL の道筋だけで切り替える小さな仕組み）
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
window.addEventListener('popstate', notify);

export function go(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  window.scrollTo(0, 0);
  notify();
}

export function useLocation() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => location.pathname + location.search);
}
