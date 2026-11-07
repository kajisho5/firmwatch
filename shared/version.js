// バージョン番号の比較（サーバー・定期チェック・画面で共通）
// "10.1.2" と "10.2" のように数字の並びで比べる。"25H2" のような Windows の書き方も数字だけを取り出して比べる。

/** @param {string} v */
export function parts(v) {
  return (String(v).match(/\d+/g) || []).map(Number);
}

/**
 * a が b より古ければ負、同じなら 0、新しければ正
 * @param {string} a @param {string} b
 */
export function compareVersions(a, b) {
  const x = parts(a), y = parts(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * 更新内容の文言から「確認が要る（now）」か「あとで見る（later）」かを決める（文言による推測）
 * @param {string} text
 */
export function severityOf(text) {
  return /セキュリティ|脆弱|互換|不具合|修正|macOS|Windows|iPadOS|security|vulnerab|compatib|\bfix/i.test(text || '') ? 'now' : 'later';
}
