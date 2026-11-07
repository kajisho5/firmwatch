-- 汎用の見張り：専用の読み取りがない機種のうち、登録済みでメーカーのページがあるものを、製品ページの見張りに結びつける
UPDATE models SET source_key = 'page:' || id
  WHERE source_key IS NULL AND maker_url IS NOT NULL AND id IN (SELECT model_id FROM gear WHERE model_id IS NOT NULL);
INSERT OR IGNORE INTO sources (key, label, page_url)
  SELECT source_key, '製品ページ（推定）', maker_url FROM models WHERE source_key LIKE 'page:%';
