-- サーバーが自分で作って持つ設定（通知用の鍵など）
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
