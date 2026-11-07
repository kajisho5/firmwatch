"""HOLDLINE の機材カタログ（docs/catalog/catalog-full.json）から FIRMWATCH の機種リストを作る。

使い方: python3 -I tools/import_holdline_catalog.py <HOLDLINEのcatalog-full.json> <出力フォルダ>

firmware の印（分類ごとのルール。推測による仮の判定。運営画面で機種ごとに直せる前提）
  yes   : ファームウェアを持つことがほぼ確実な分類
  maybe : 機種によって持つ・持たない（電源の入るものと入らないものが混ざる）
  no    : ファームウェアを持たない分類（監視の候補から外す）
control_software: 操作ソフト（PC/Mac用）を使うことが多い分類。OS注意報の対象候補
"""
import collections
import csv
import json
import sys
from pathlib import Path

YES = {
    ("映像", "スイッチャー"), ("映像", "PTZカメラ"), ("映像", "カメラ"), ("映像", "カメラコントローラー"),
    ("映像", "コンバーター・分配"), ("映像", "スケーラー"), ("映像", "プレーヤー"), ("映像", "プロジェクター"),
    ("映像", "マルチビューワー"), ("映像", "ルーター"), ("映像", "レコーダー"), ("映像", "ワイヤレス映像伝送"),
    ("映像", "LEDビジョン"), ("映像", "測定器"), ("映像", "延長器"),
    ("配信", "NDI機器"), ("配信", "エンコーダ"), ("配信", "デコーダ"), ("配信", "キャプチャ"),
    ("配信", "ネットワーク"), ("配信", "Web会議"),
    ("音響", "ミキサー"), ("音響", "アンプ・DSP"), ("音響", "ステージボックス・Dante"), ("音響", "レコーダー"),
    ("音響", "ワイヤレスマイク"), ("音響", "イヤモニ"), ("音響", "DI・インターフェース"),
    ("音響", "会議マイク"), ("音響", "会議スピーカーフォン"), ("音響", "エフェクター・アウトボード"),
    ("音響", "通訳・補聴"),
    ("照明", "照明卓"), ("照明", "ムービング"), ("照明", "DMX周辺"),
    ("通信", "インカム"), ("通信", "タリー"), ("通信", "無線機"),
    ("PC", "書画カメラ"),
}
NO = {
    ("ケーブル・消耗品", "ケーブル"), ("ケーブル・消耗品", "消耗品"),
    ("映像", "スクリーン"), ("映像", "モニタースタンド"), ("映像", "変換アダプタ"),
    ("映像", "プロジェクターレンズ"), ("電源・特機", "トラス・スタンド"), ("音響", "有線マイク"),
}
CONTROL_SW = {
    ("映像", "スイッチャー"), ("映像", "ルーター"), ("映像", "レコーダー"), ("映像", "コンバーター・分配"),
    ("映像", "マルチビューワー"), ("映像", "PTZカメラ"), ("映像", "カメラ"),
    ("配信", "キャプチャ"), ("配信", "エンコーダ"), ("配信", "NDI機器"),
    ("音響", "ミキサー"), ("音響", "DI・インターフェース"), ("音響", "ステージボックス・Dante"),
    ("音響", "アンプ・DSP"), ("音響", "ワイヤレスマイク"), ("照明", "照明卓"), ("通信", "インカム"),
}


def classify(x):
    key = (x["category"], x["sub"])
    if x.get("kind") == "bulk" or x.get("generic"):
        return "no"
    if key in YES:
        return "yes"
    if key in NO:
        return "no"
    return "maybe"


def main(src, out):
    data = json.loads(Path(src).read_text(encoding="utf-8"))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    models = []
    for x in data:
        fw = classify(x)
        models.append({
            "maker": x["maker"], "model": x["model"], "display": x["display"],
            "category": x["category"], "sub": x["sub"],
            "firmware": fw,
            "control_software": fw != "no" and (x["category"], x["sub"]) in CONTROL_SW,
            "discontinued": bool(x.get("discontinued")), "verified": bool(x.get("verified")),
            "maker_url": x.get("maker_url"),
        })
    (out / "catalog.json").write_text(json.dumps(models, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # メーカー別の数（読み取り部品をどのメーカーから作るかの優先順位用）
    agg = collections.defaultdict(lambda: {"yes": 0, "maybe": 0, "no": 0, "current_yes": 0})
    for m in models:
        a = agg[m["maker"]]
        a[m["firmware"]] += 1
        if m["firmware"] == "yes" and not m["discontinued"]:
            a["current_yes"] += 1
    rows = sorted(agg.items(), key=lambda kv: (-kv[1]["current_yes"], -kv[1]["yes"], kv[0]))
    with open(out / "makers.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["順位", "メーカー", "ファームあり（現行品）", "ファームあり（全部）", "機種による", "ファームなし"])
        for i, (mk, a) in enumerate(rows, 1):
            w.writerow([i, mk, a["current_yes"], a["yes"], a["maybe"], a["no"]])

    c = collections.Counter(m["firmware"] for m in models)
    print(f"機種 {len(models)} / メーカー {len(agg)}")
    print(f"ファームあり {c['yes']} / 機種による {c['maybe']} / なし {c['no']}")
    print(f"OS注意報の対象候補 {sum(m['control_software'] for m in models)}")
    print("上位20メーカー（ファームあり・現行品）:")
    for i, (mk, a) in enumerate(rows[:20], 1):
        print(f"  {i:2d}. {mk}  {a['current_yes']}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
