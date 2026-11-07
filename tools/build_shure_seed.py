"""Shure の機種を、Shure の一覧（shure:<型番>）に結びつける SQL を作る → migrations/0005_shure.sql"""
import json, re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
cat = json.loads((ROOT / 'data/catalog.json').read_text(encoding='utf-8'))
norm = lambda s: re.sub(r'[^A-Z0-9]', '', s.upper().replace('+', 'PLUS'))
ids, n = [], 0
for m in cat:
    if m['firmware'] == 'no':
        continue
    n += 1  # build_seed.py と同じ順で id を振っている
    if m['maker'] == 'Shure' and len(norm(m['model'])) >= 3:
        ids.append((n, 'shure:' + norm(m['model'])))
out = ['-- 自動生成（tools/build_shure_seed.py）', '-- Shure は公式の一覧から読む（checker/shure.mjs）']
for i, key in ids:
    out.append(f"INSERT OR IGNORE INTO sources (key, label, page_url) VALUES ('{key}', 'Shure ソフトウェア・ファームウェア一覧', 'https://www.shure.com/ja-JP/support/downloads/software-firmware-archive');")
    out.append(f"UPDATE models SET source_key = '{key}' WHERE id = {i} AND maker = 'Shure';")
(ROOT / 'migrations/0005_shure.sql').write_text('\n'.join(out) + '\n', encoding='utf-8')
print(len(ids), '機種')
