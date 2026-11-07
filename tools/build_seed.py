"""data/catalog.json と data/sources.json から、機種と取得先を入れる SQL（migrations/0002_catalog.sql）を作る。

使い方: python3 -I tools/build_seed.py
ファームなし（firmware == "no"）の機種は入れない。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def norm(s):
    return re.sub(r"[\s\-_/.()（）]", "", s).lower()


def main():
    cat = json.loads((ROOT / "data/catalog.json").read_text(encoding="utf-8"))
    src = json.loads((ROOT / "data/sources.json").read_text(encoding="utf-8"))
    rules = [(r["maker"], re.compile(r["pattern"], re.I), r["source"]) for r in src["rules"]]
    keys = {s["key"] for s in src["sources"]}
    for _, _, k in rules:
        assert k in keys, k
    out = ["-- 自動生成（tools/build_seed.py）。手で直さない", "DELETE FROM models;"]
    for s in src["sources"]:
        out.append(
            f"INSERT INTO sources (key, label, page_url) VALUES ({q(s['key'])}, {q(s['label'])}, {q(s['page'])}) "
            f"ON CONFLICT(key) DO UPDATE SET label=excluded.label, page_url=excluded.page_url;")
    n = linked = 0
    rows = []
    for m in cat:
        if m["firmware"] == "no":
            continue
        n += 1
        key = None
        for maker, pat, k in rules:
            if m["maker"] == maker and pat.search(m["model"]):
                key = k
                break
        linked += key is not None
        rows.append("(" + ",".join([
            q(n), q(m["maker"]), q(m["model"]), q(m["category"]), q(m["sub"]), q(m["firmware"]),
            q(bool(m["control_software"])), q(bool(m["discontinued"])), q(m.get("maker_url")), q(key),
            q(norm(m["maker"] + m["model"]))]) + ")")
    cols = "(id, maker, model, category, sub, firmware, control_sw, discontinued, maker_url, source_key, search)"
    for i in range(0, len(rows), 200):
        out.append(f"INSERT INTO models {cols} VALUES\n" + ",\n".join(rows[i:i + 200]) + ";")
    (ROOT / "migrations/0002_catalog.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"機種 {n} 件（自動確認できる機種 {linked} 件）")


if __name__ == "__main__":
    main()
