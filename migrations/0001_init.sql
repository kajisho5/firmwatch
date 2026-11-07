-- FIRMWATCH 初期スキーマ
-- 利用者（メールアドレスは持たない。ログインはパスキー）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  digest_weekday INTEGER NOT NULL DEFAULT 1,   -- 0=日曜 … 6=土曜。あとで見る更新のまとめ通知
  digest_hour INTEGER NOT NULL DEFAULT 8,      -- 日本時間の時
  last_digest_at INTEGER,
  os_macos INTEGER NOT NULL DEFAULT 1,
  os_windows INTEGER NOT NULL DEFAULT 1,
  os_ipados INTEGER NOT NULL DEFAULT 0,
  recovery_hash TEXT                            -- 引き継ぎコードの SHA-256
);

CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,                          -- credential ID（base64url）
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,                     -- base64url
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX passkeys_user ON passkeys(user_id);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  user_id TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- 機種（HOLDLINE のカタログから取り込み。ファームなしの分類は入れない）
CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  maker TEXT NOT NULL,
  model TEXT NOT NULL,
  category TEXT NOT NULL,
  sub TEXT NOT NULL,
  firmware TEXT NOT NULL,                       -- yes / maybe
  control_sw INTEGER NOT NULL DEFAULT 0,        -- 操作ソフトを使う分類（OSの通知の対象）
  discontinued INTEGER NOT NULL DEFAULT 0,
  maker_url TEXT,
  source_key TEXT,                              -- 自動確認の取得先（例 bmd:atem:ATEM Switchers）。無ければ手で記録
  search TEXT NOT NULL                          -- 検索用（小文字・空白なし）
);
CREATE INDEX models_search ON models(search);
CREATE INDEX models_source ON models(source_key);

-- 取得先ごとの状態
CREATE TABLE sources (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,                          -- 画面に出す名前（例 ATEM Switchers）
  page_url TEXT,                                -- 利用者が開くメーカーのページ
  checked_at INTEGER,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  baseline_done INTEGER NOT NULL DEFAULT 0      -- 初回の取り込みは通知しない
);

-- 公開されたバージョン
CREATE TABLE releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  released_at INTEGER,
  notes TEXT,
  url TEXT,
  severity TEXT NOT NULL,                       -- now（確認が要る）/ later（あとで見る）
  found_at INTEGER NOT NULL,
  UNIQUE (source_key, version)
);
CREATE INDEX releases_source ON releases(source_key, released_at);

-- 手持ちの機材（1行＝1台）
CREATE TABLE gear (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id INTEGER REFERENCES models(id),
  custom_maker TEXT,                            -- カタログに無い機種を手で入れたとき
  custom_model TEXT,
  asset_no TEXT,
  serial TEXT,
  purchased_on TEXT,                            -- YYYY-MM-DD
  purchased_from TEXT,
  current_version TEXT,
  last_updated_on TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX gear_user ON gear(user_id);

CREATE TABLE gear_updates (
  id TEXT PRIMARY KEY,
  gear_id TEXT NOT NULL REFERENCES gear(id) ON DELETE CASCADE,
  from_version TEXT,                            -- 空なら「購入」
  to_version TEXT NOT NULL,
  updated_on TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX gear_updates_gear ON gear_updates(gear_id, updated_on);

-- 利用者ごとの通知
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id),
  severity TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  pushed_at INTEGER,
  UNIQUE (user_id, release_id)
);
CREATE INDEX alerts_user ON alerts(user_id, created_at);

CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  failed_at INTEGER
);
CREATE INDEX push_subs_user ON push_subs(user_id);
