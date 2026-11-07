"""FIRMWATCH の画面デザインSVG v2（表示データはすべて架空）

方向：放送・PAの現場機材。目立たせるのは「タリーランプ」1か所だけ。
  赤く光る＝確認が要る（本番中のタリーと同じ意味）、緑＝最新、消灯＝確認できていない
地はアルミ筐体の明るいグレー、文字は黒。英字の小見出し・等幅の小ラベル・同じ角丸カードの繰り返しはやめる。
"""
from pathlib import Path

W, H = 390, 844
GAP = 48
TOP = 112
# 色
CASE = "#D5D9DD"     # 筐体（地）
PANEL = "#F2F3F4"    # パネル
WHITE = "#FFFFFF"
INK = "#000000"
SUB = "#4B525A"
FAINT = "#7C838B"
RULE = "#C3C8CD"
RED = "#D70015"
GREEN = "#00843D"
OFF = "#A3A9AF"
FONT = "'IBM Plex Sans JP','Noto Sans JP',sans-serif"
SHEET = "#1E2124"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def t(x, y, s, size=15, fill=INK, w=400, anchor="start", extra=""):
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{w}" '
            f'fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>')


def r(x, y, w, h, rx=0, fill=PANEL, stroke=None, sw=1):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st}/>'


def line(x1, y1, x2, y2, c=RULE, w=1):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{w}"/>'


DEFS = f'''<defs>
<linearGradient id="litR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF5A66"/><stop offset=".45" stop-color="{RED}"/><stop offset="1" stop-color="#A3000F"/></linearGradient>
<linearGradient id="litG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3DD27E"/><stop offset=".45" stop-color="{GREEN}"/><stop offset="1" stop-color="#005E2B"/></linearGradient>
<linearGradient id="unlit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C4C9CE"/><stop offset="1" stop-color="#9198A0"/></linearGradient>
<filter id="glowR" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.5"/></filter>
</defs>'''


def lamp(x, y, w, h, state, glow=True):
    """タリーランプ。state: red / green / off"""
    fill = {"red": "url(#litR)", "green": "url(#litG)", "off": "url(#unlit)"}[state]
    out = ""
    if glow and state == "red":
        out += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="{RED}" opacity=".55" filter="url(#glowR)"/>'
    out += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="{fill}" stroke="#00000033" stroke-width=".8"/>'
    out += f'<rect x="{x+1.5}" y="{y+1.5}" width="{max(w-3,1)}" height="{min(3,h/4)}" rx="1" fill="#ffffff" opacity="{.35 if state != "off" else .25}"/>'
    return out


def status_bar():
    return (t(30, 36, "9:41", 16, INK, 600)
            + r(318, 24, 26, 13, 4, "none", INK, 1.2) + r(320.5, 26.5, 18, 8, 2, INK)
            + r(345, 28, 2, 5, 1, INK)
            + "".join(r(268 + i * 6, 34 - i * 3, 4, 4 + i * 3, 1, INK) for i in range(4))
            + r(140, 11, 110, 32, 16, "#000"))


def home_ind():
    return r(128, 830, 134, 5, 2.5, INK)


def icon(name, cx, cy, c, sw=1.8):
    s = f'fill="none" stroke="{c}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
    d = {
        "plus": f'<path d="M{cx-7} {cy} h14 M{cx} {cy-7} v14" {s}/>',
        "share": f'<rect x="{cx-7}" y="{cy-3}" width="14" height="13" rx="2" {s}/><path d="M{cx} {cy-11} v12 M{cx-4} {cy-7} l4 -4 l4 4" {s}/>',
        "back": f'<path d="M{cx+4} {cy-8} l-8 8 l8 8" {s}/>',
        "chev": f'<path d="M{cx-3} {cy-6} l6 6 l-6 6" {s}/>',
        "check": f'<path d="M{cx-6} {cy} l4 4 l8 -9" {s}/>',
        "search": f'<circle cx="{cx-2}" cy="{cy-2}" r="6" {s}/><path d="M{cx+2.5} {cy+2.5} l5 5" {s}/>',
        "home": f'<rect x="{cx-8}" y="{cy-8}" width="16" height="16" rx="3" {s}/><path d="M{cx-4} {cy} h8 M{cx} {cy-4} v8" {s}/>',
    }
    return d[name]


def header(title, right=""):
    return t(20, 92, title, 24, INK, 700) + right


def tab_bar(active):
    out = [r(0, 764, W, 80, 0, PANEL), line(0, 764, W, 764, RULE)]
    tabs = ["更新", "機材", "設定"]
    for i, name in enumerate(tabs):
        cx = 65 + i * 130
        on = i == active
        out.append(t(cx, 798, name, 15, INK if on else FAINT, 700 if on else 500, "middle"))
        if on:
            out.append(r(cx - 18, 765, 36, 3, 0, INK))
        if i == 0:
            out.append(lamp(cx + 22, 786, 7, 7, "red", glow=False))
    out.append(home_ind())
    return "".join(out)


def btn(x, y, w, label, primary=True, h=50):
    if primary:
        return r(x, y, w, h, 6, INK) + t(x + w / 2, y + h / 2 + 6, label, 16, WHITE, 600, "middle")
    return r(x, y, w, h, 6, WHITE, INK, 1.5) + t(x + w / 2, y + h / 2 + 6, label, 16, INK, 600, "middle")


def toggle(x, y, on=True):
    if on:
        return r(x, y, 51, 31, 15.5, INK) + f'<circle cx="{x+35.5}" cy="{y+15.5}" r="12.5" fill="{WHITE}"/>'
    return r(x, y, 51, 31, 15.5, "#B9BEC3") + f'<circle cx="{x+15.5}" cy="{y+15.5}" r="12.5" fill="{WHITE}"/>'


def ver(x, y, a, b, size=15, dim=False):
    """バージョンの変化。旧は細く、新は太く"""
    aw = len(a) * size * 0.5
    return (t(x, y, a, size, FAINT if dim else SUB, 400)
            + t(x + aw + 6, y, "→", size, FAINT, 400)
            + t(x + aw + 6 + size * 1.25, y, b, size, FAINT if dim else INK, 700))


def section_title(y, s):
    return t(20, y, s, 14, SUB, 600)


# ---------------- 画面 ----------------

def s1():
    o = [status_bar()]
    # 見出しの右：確認が要る件数のランプ
    o.append(header("更新"))
    o.append(lamp(296, 68, 74, 34, "red"))
    o.append(t(333, 92, "2件", 18, WHITE, 700, "middle"))
    # 切り替え（下線）
    o.append(t(20, 140, "確認が要る", 16, INK, 700) + r(20, 150, 80, 3, 0, INK))
    o.append(t(128, 140, "あとで見る 5件", 16, FAINT, 500))
    o.append(line(0, 153, W, 153))

    def row(y, h, st, title, change, reason, when, dim=False):
        g = [r(0, y, W, h, 0, PANEL if not dim else "#E4E7EA")]
        g.append(lamp(14, y + 16, 8, h - 32, st, glow=not dim))
        g.append(t(36, y + 36, title, 18, INK if not dim else SUB, 700))
        g.append(t(370, y + 36, when, 13, FAINT, 400, "end"))
        yy = y + 62
        if change:
            g.append(ver(36, yy, *change, dim=dim))
            yy += 26
        for i, s in enumerate(reason):
            g.append(t(36, yy + i * 22, s, 14, SUB if not dim else FAINT))
        return "".join(g)

    o.append(row(162, 128, "red", "macOS 27.1 が公開", None,
                 ["操作ソフトを使う機材が3台あります。", "対応を確かめてから上げてください。"], "今朝"))
    o.append(row(298, 120, "red", "ATEM Mini Pro", ("10.1.2", "10.2"),
                 ["不具合の修正が含まれています。"], "昨日"))
    o.append(row(426, 120, "off", "V-160HD RCS", ("4.1.0", "4.2.0"),
                 ["11月3日に確認済み。"], "11/03", dim=True))
    o.append(t(20, 580, "赤いランプは、まだ確認していない更新です。", 13, SUB))
    o.append(t(20, 601, "確認が要るかは、更新内容の文言から自動で決めています。", 13, SUB))
    o.append(tab_bar(0))
    return "".join(o)


def s2():
    o = [status_bar(), header("機材")]
    o.append(r(270, 66, 44, 36, 6, WHITE, RULE) + icon("share", 292, 85, INK))
    o.append(r(326, 66, 44, 36, 6, INK) + icon("plus", 348, 84, WHITE))
    o.append(t(20, 132, "8台のうち、2台に確認が要る更新があります。", 14, SUB))

    def group(y, maker, rows):
        g = [section_title(y, maker)]
        for i, (name, sub, st) in enumerate(rows):
            ry = y + 12 + i * 64
            g.append(r(0, ry, W, 63, 0, PANEL))
            g.append(lamp(20, ry + 24, 14, 14, st, glow=st == "red"))
            g.append(t(48, ry + 28, name, 16, INK, 600))
            g.append(t(48, ry + 49, sub, 13, RED if st == "red" else SUB, 500 if st == "red" else 400))
            g.append(icon("chev", 360, ry + 31, FAINT))
        return "".join(g)

    o.append(group(174, "Blackmagic Design", [
        ("ATEM Mini Pro（2台）", "1台が古いバージョンのまま。最新は 10.2", "red"),
        ("ATEM Television Studio HD8", "最新の 10.2", "green"),
        ("HyperDeck Studio HD Mini", "最新の 9.0", "green")]))
    o.append(group(398, "Roland", [
        ("V-160HD RCS", "最新は 4.2.0。手元は 4.1.0", "red"),
        ("VR-6HD", "最新の 3.1", "green"),
        ("V-1HD+", "公開ページを読めず、確認が止まっています", "off")]))
    o.append(tab_bar(1))
    return "".join(o)


def s4():
    o = [status_bar(), icon("back", 24, 72, INK), t(36, 78, "機材", 16, INK, 500)]
    o.append(t(20, 124, "ATEM Mini Pro", 28, INK, 700))
    o.append(t(20, 150, "Blackmagic Design の映像スイッチャー", 14, SUB))
    o.append(r(0, 170, W, 92, 0, PANEL))
    o.append(t(20, 198, "公開されている最新", 13, SUB))
    o.append(t(20, 238, "10.2", 32, INK, 700))
    o.append(t(110, 238, "2026年11月6日に公開", 14, SUB))
    o.append(btn(20, 276, 350, "メーカーの更新ページを開く", True, 48))
    o.append(section_title(358, "手持ちの2台"))
    units = [("A-01", "10.1.2 のまま", "2024年4月購入、最後の更新 2026年8月", "red"),
             ("A-02", "10.2 に更新済み", "2025年9月購入、最後の更新 2026年11月", "green")]
    for i, (n, a, b, st) in enumerate(units):
        y = 370 + i * 72
        o.append(r(0, y, W, 71, 0, PANEL))
        o.append(lamp(20, y + 28, 14, 14, st, glow=st == "red"))
        o.append(t(48, y + 30, n, 17, INK, 700) + t(104, y + 30, a, 15, RED if st == "red" else SUB, 600 if st == "red" else 400))
        o.append(t(48, y + 53, b, 13, SUB) + icon("chev", 360, y + 36, FAINT))
    o.append(section_title(548, "公開されたバージョン"))
    hist = [("10.2", "2026/11/06", "不具合の修正"), ("10.1.2", "2026/08/20", "動作の安定化"),
            ("10.1", "2026/06/02", "機能の追加")]
    for i, (v, d, n) in enumerate(hist):
        y = 560 + i * 52
        o.append(r(0, y, W, 51, 0, PANEL))
        o.append(t(20, y + 32, v, 16, INK, 700) + t(100, y + 32, n, 14, SUB)
                 + t(370, y + 32, d, 13, FAINT, 400, "end"))
    o.append(home_ind())
    return "".join(o)


def s8():
    o = [status_bar(), icon("back", 24, 72, INK), t(36, 78, "ATEM Mini Pro", 16, INK, 500)]
    o.append(t(20, 124, "A-01", 30, INK, 700))
    o.append(lamp(96, 102, 14, 14, "red"))
    o.append(t(370, 122, "編集", 16, INK, 600, "end"))
    rows = [("管理番号", "A-01"), ("シリアル番号", "SAMPLE-0001"), ("購入日", "2024年4月10日"),
            ("購入先", "サンプル機材店"), ("今のバージョン", "10.1.2（最新は 10.2）"), ("メモ", "予備機、ケースBに収納")]
    for i, (k, v) in enumerate(rows):
        y = 146 + i * 47
        o.append(r(0, y, W, 46, 0, PANEL))
        o.append(t(20, y + 29, k, 14, SUB))
        o.append(t(370, y + 29, v, 15, RED if k == "今のバージョン" else INK, 600 if k == "今のバージョン" else 400, "end"))
    o.append(btn(20, 444, 350, "更新したことを記録する", True))
    o.append(section_title(530, "更新の記録"))
    logs = [("10.1 から 10.1.2 へ", "2026年8月21日", "テスト太郎"),
            ("9.6 から 10.1 へ", "2026年6月5日", "テスト花子"),
            ("購入（9.6）", "2024年4月10日", "テスト太郎")]
    for i, (v, d, who) in enumerate(logs):
        y = 542 + i * 64
        o.append(r(0, y, W, 63, 0, PANEL))
        o.append(t(20, y + 27, v, 16, INK, 600) + t(370, y + 27, d, 13, SUB, 400, "end"))
        o.append(t(20, y + 49, f"{who}が記録", 13, FAINT))
    o.append(home_ind())
    return "".join(o)


def s7():
    o = [status_bar(), icon("back", 24, 72, INK), t(36, 78, "機材", 16, INK, 500)]
    o.append(t(20, 124, "書き出し", 28, INK, 700))
    o.append(section_title(170, "ファイルの形式"))
    o.append(r(20, 182, 350, 44, 6, WHITE, INK, 1.5))
    o.append(r(20, 182, 175, 44, 6, INK) + r(170, 182, 25, 44, 0, INK))
    o.append(t(107, 210, "Excel", 16, WHITE, 600, "middle") + t(282, 210, "CSV", 16, INK, 600, "middle"))
    o.append(section_title(262, "どの機材を"))
    opts = [("すべて", "8台", True), ("Blackmagic Design だけ", "3台", False), ("確認が要る更新があるもの", "2台", False)]
    for i, (a, b, sel) in enumerate(opts):
        y = 274 + i * 52
        o.append(r(0, y, W, 51, 0, PANEL))
        o.append(f'<circle cx="31" cy="{y+26}" r="9" fill="{WHITE}" stroke="{INK}" stroke-width="1.6"/>')
        if sel:
            o.append(f'<circle cx="31" cy="{y+26}" r="4.5" fill="{INK}"/>')
        o.append(t(52, y + 31, a, 15, INK) + t(370, y + 31, b, 14, SUB, 400, "end"))
    o.append(section_title(458, "入れる表"))
    for i, (a, b) in enumerate([("機材の一覧", "管理番号、機種、今と最新のバージョン、購入日など"),
                                ("更新の記録", "いつ、どの台を、どのバージョンにしたか、誰が")]):
        y = 470 + i * 62
        o.append(r(0, y, W, 61, 0, PANEL))
        o.append(r(21, y + 20, 20, 20, 4, INK) + icon("check", 31, y + 30, WHITE))
        o.append(t(52, y + 28, a, 15, INK, 600) + t(52, y + 48, b, 12.5, SUB))
    o.append(t(20, 622, "Excel は1つのファイルに表を2枚入れます。", 13, SUB))
    o.append(t(20, 642, "CSV は表ごとに分け、Excel で文字化けしない形にします。", 13, SUB))
    o.append(btn(20, 676, 350, "書き出して保存する", True))
    o.append(home_ind())
    return "".join(o)


def s0():
    o = [status_bar()]
    o.append(lamp(20, 98, 30, 20, "red"))
    o.append(t(62, 115, "FIRMWATCH", 20, INK, 700, "start", 'letter-spacing="1"'))
    o.append(t(20, 172, "機材のファームを、", 30, INK, 700))
    o.append(t(20, 212, "まとめて見張る。", 30, INK, 700))
    o.append(t(20, 252, "持っている機材を登録すると、ファームや", 15, SUB))
    o.append(t(20, 276, "ソフトの新しいバージョンが出たときに通知します。", 15, SUB))
    o.append(section_title(330, "先にホーム画面へ追加してください"))
    steps = [("share", "共有ボタン（Android はメニュー）を押す"), ("home", "「ホーム画面に追加」を選ぶ"), ("check", "ホーム画面のアイコンから開く")]
    for i, (ic, s_) in enumerate(steps):
        y = 342 + i * 56
        o.append(r(0, y, W, 55, 0, PANEL))
        o.append(t(20, y + 34, f"{i+1}", 16, FAINT, 700))
        o.append(icon(ic, 56, y + 28, INK) + t(80, y + 34, s_, 15, INK))
    o.append(btn(20, 548, 350, "パスキーで始める"))
    o.append(t(20, 622, "パスワードもメールアドレスも要りません。", 13, SUB))
    o.append(t(20, 643, "顔認証や指紋でログインします。", 13, SUB))
    o.append(btn(20, 676, 350, "引き継ぎコードで入る", False))
    o.append(home_ind())
    return "".join(o)


def s3():
    o = [status_bar(), icon("back", 24, 72, INK), t(36, 78, "機材", 16, INK, 500)]
    o.append(t(20, 124, "機材を追加", 28, INK, 700))
    o.append(r(20, 144, 350, 48, 6, WHITE, INK, 1.5) + icon("search", 44, 168, INK) + t(62, 174, "ATEM Mini", 16, INK))
    o.append(r(146, 158, 1.6, 22, 0, INK))
    o.append(t(20, 222, "14,711機種から探せます。無ければ手で入力できます。", 12.5, SUB))
    items = [("ATEM Mini", "映像スイッチャー", False), ("ATEM Mini Pro", "映像スイッチャー", True),
             ("ATEM Mini Pro ISO", "映像スイッチャー", False), ("ATEM Mini Extreme ISO", "映像スイッチャー", False)]
    o.append(section_title(256, "Blackmagic Design"))
    for i, (n, c, sel) in enumerate(items):
        y = 268 + i * 60
        o.append(r(0, y, W, 59, 0, WHITE if sel else PANEL))
        if sel:
            o.append(r(0, y, 4, 59, 0, INK))
        o.append(t(20, y + 27, n, 16, INK, 700 if sel else 500) + t(20, y + 47, c, 12.5, SUB))
        if sel:
            o.append(icon("check", 350, y + 30, INK, 2.2))
    o.append(section_title(538, "今のバージョン（分かれば）"))
    o.append(r(20, 550, 350, 50, 6, WHITE, RULE, 1.2) + t(36, 581, "10.1.2", 16, INK))
    o.append(t(20, 626, "入れておくと、上げ忘れている台も知らせます。", 13, SUB))
    o.append(btn(20, 700, 350, "追加する"))
    o.append(home_ind())
    return "".join(o)


def s5():
    o = [status_bar(), header("出番")]
    o.append(r(326, 66, 44, 36, 6, INK) + icon("plus", 348, 84, WHITE))
    o.append(r(0, 116, W, 104, 0, PANEL))
    o.append(t(20, 146, "11月14日（土）", 14, SUB, 600))
    o.append(t(20, 176, "サンプル現場A", 22, INK, 700))
    o.append(t(20, 204, "前日18時に確認の通知", 14, SUB) + toggle(319, 183, True))
    o.append(r(0, 228, W, 64, 0, "#FBE3E5"))
    o.append(lamp(20, 248, 14, 14, "red"))
    o.append(t(46, 255, "まだ確認していない更新が2件", 15, INK, 700))
    o.append(t(46, 277, "上げるか、今のバージョンのまま行くかを決めておきましょう。", 12.5, SUB))
    o.append(section_title(326, "持っていく機材"))
    rows = [("ATEM Mini Pro（A-01）", "10.1.2 → 最新は 10.2", "red"),
            ("V-160HD RCS", "4.1.0 → 最新は 4.2.0", "red"),
            ("HyperDeck Studio HD Mini", "最新の 9.0", "green")]
    for i, (n, s, st) in enumerate(rows):
        y = 338 + i * 62
        o.append(r(0, y, W, 61, 0, PANEL) + lamp(20, y + 23, 14, 14, st, glow=st == "red"))
        o.append(t(48, y + 27, n, 16, INK, 600) + t(48, y + 48, s, 13, RED if st == "red" else SUB))
    o.append(btn(20, 538, 350, "持っていく機材を選び直す", False))
    o.append(section_title(628, "その後の現場"))
    o.append(r(0, 640, W, 52, 0, PANEL) + t(20, 672, "サンプル現場B", 15, INK) + t(370, 672, "11月22日（日）", 14, SUB, 400, "end"))
    o.append(tab_bar(2))
    return "".join(o)


def s6():
    o = [status_bar(), header("設定")]

    def sec(y, title, rows):
        g = [section_title(y, title)]
        for i, (label, sub, right) in enumerate(rows):
            ry = y + 12 + i * 54
            g.append(r(0, ry, W, 53, 0, PANEL))
            if sub:
                g.append(t(20, ry + 24, label, 15, INK) + t(20, ry + 43, sub, 12, SUB))
            else:
                g.append(t(20, ry + 32, label, 15, INK))
            if right in ("on", "off"):
                g.append(toggle(319, ry + 11, right == "on"))
            else:
                g.append(t(352, ry + 32, right, 14, SUB, 400, "end") + icon("chev", 362, ry + 26, FAINT))
        return "".join(g)

    o.append(sec(132, "通知", [("このiPhoneに通知", "許可済み", "on"),
                               ("ほかの端末", "Android 1台", "2台目を追加")]))
    o.append(sec(280, "確認が要る更新", [("届け方", None, "すぐ通知")]))
    o.append(sec(374, "あとで見る更新", [("まとめて通知する日時", None, "毎週月曜 8時")]))
    o.append(sec(468, "OSの新しいバージョンを知らせる", [("macOS", None, "on"), ("Windows", None, "on"), ("iPadOS", None, "off")]))
    o.append(r(0, 646, W, 53, 0, PANEL) + t(20, 678, "引き継ぎコードを表示", 15, INK) + icon("chev", 362, 672, FAINT))
    o.append(r(0, 700, W, 53, 0, PANEL) + t(20, 732, "テスト太郎", 15, INK) + t(370, 732, "ログアウト", 15, RED, 600, "end"))
    o.append(tab_bar(2))
    return "".join(o)


def sheet(screens, title, path):
    n = len(screens)
    tw = n * W + (n + 1) * GAP
    th = TOP + H + 84
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{tw}" height="{th}" viewBox="0 0 {tw} {th}">', DEFS,
           r(0, 0, tw, th, 0, SHEET),
           t(GAP, 52, title, 24, "#F2F3F4", 700),
           t(GAP, 82, "FIRMWATCH（仮）iPhone 用 PWA、390×844。名前・番号・バージョン・日付はすべて架空です。", 14, "#AEB4BA")]
    for i, (sid, name, fn) in enumerate(screens):
        x = GAP + i * (W + GAP)
        out.append(f'<clipPath id="c{i}"><rect x="0" y="0" width="{W}" height="{H}" rx="46"/></clipPath>')
        out.append(f'<g transform="translate({x},{TOP})"><g clip-path="url(#c{i})">{r(0, 0, W, H, 0, CASE)}{fn()}</g>')
        out.append(r(0, 0, W, H, 46, "none", "#50565C", 3) + "</g>")
        out.append(t(x, TOP + H + 40, f"{sid}  {name}", 16, "#F2F3F4", 600))
    out.append("</svg>")
    Path(path).write_text("\n".join(out), encoding="utf-8")


if __name__ == "__main__":
    d = Path(__file__).resolve().parent.parent / "docs"
    sheet([("S1", "更新の一覧（ホーム）", s1), ("S2", "機材", s2), ("S4", "機種の詳細", s4)], "主要画面", d / "design-main.svg")
    sheet([("S8", "1台ごとの台帳", s8), ("S7", "書き出し", s7)], "台帳と書き出し", d / "design-ledger.svg")
    sheet([("S0", "はじめに", s0), ("S3", "機材を追加", s3), ("S6", "設定", s6)],
          "そのほかの画面", d / "design-sub.svg")
