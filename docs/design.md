# FIRMWATCH（仮）詳細設計書 v0.1

持っている機材を登録しておくと、新しいファーム・ソフト・OSの更新が出たときに知らせるサービス。
HOLDLINE とは別の単体サービス。

作成日：2026-11-07　状態：**確認待ち（Step 2 まで）**

---

## 1. 要件

### 1.1 目的
- 持っている機材のファームウェアのバージョンを1か所で管理し、新しいバージョンが出たら知らせる
- 「OSやファームを上げたら機材が動かない」を前もって防ぐ
- 「新しいバージョンが出たこと」を知らせるだけでなく、「放っておくと困るもの」と「後で見ればいいもの」を分けて知らせる

### 1.2 利用者
- 配信・PA・映像のオペレーター、機材を持つ会社（個人〜数人規模）
- 主に iPhone で受け取る。設定もiPhoneだけで完結させる

### 1.3 機能（最初のバージョン）
| # | 機能 | 内容 |
|---|---|---|
| F1 | 機材登録 | メーカー → 機種を検索して登録。手元のバージョン（任意）も入れられる |
| F2 | バージョンの監視 | 運営側が用意した「監視先リスト」を1日数回見に行き、バージョン番号の変化を見つける |
| F3 | 通知 | 「確認が要る」「あとで見る」の2段階。確認が要るものはすぐプッシュ通知、あとで見るものは週1回まとめてプッシュ通知。**メールは使わない** |
| F4 | OS注意報 | macOS・Windows・iPadOS の新しいバージョンが出たら、「対応状況を確認してから上げて」と知らせる（登録機材の操作ソフトがある人だけ） |
| F6 | バージョンの履歴 | 機種ごとのバージョンの一覧と公式ページへのリンク |
| F7 | 1台ごとの台帳 | 同じ機種を何台持っていても1台ずつ管理。管理番号・シリアル番号（任意）・購入日・購入先（任意）・今のバージョン・メモ |
| F8 | 更新の記録 | 「アップデートした」を押すと、いつ・どの台を・何から何へ・誰が、を記録。今のバージョンも自動で書き換わる。購入時のバージョンも記録の最初に残る |
| F9 | 書き出し | Excel（.xlsx）と CSV。範囲は「すべて／メーカーで絞る／確認が要る更新があるものだけ」。表は「機材の一覧」「更新の記録」の2つ（Excel はシート2枚で1ファイル、CSV は表ごとに1ファイル）。iPhone では共有シートから「ファイル」に保存できる |

### 1.4 最初のバージョンでやらないこと
- 機材そのものへの接続・自動アップデート（安全のため、知らせるだけ）
- LINE 通知（無料は月200通まで・追加配信不可のため、利用者が増えると成り立たない）
- 任意URLの監視（運営側で監視先を管理する。要望が多ければ v2）
- 既存の機材台帳（Excel・CSV）の取り込み（v2 で入れる候補。書き出しと同じ列にしておく）

### 1.5 重要度の決め方（ルール）
公開された更新内容（リリースノート）の文言で自動判定し、運営が手で直せるようにする。
- 🔴 すぐ見る：「セキュリティ」「macOS」「Windows」「対応」「互換」「不具合を修正」「recovery」「security」「compatib」などを含む／OSの新しいバージョン
- ⚪ まとめて見る：それ以外（機能追加など）
- ※ 文言での判定なので外れることがある（推測による判定）。画面に「自動判定」と表示する

---

## 2. 技術選定

### 2.1 比較
| 観点 | A：Cloudflare Workers＋Hono＋D1＋PWA（おすすめ） | B：Swift の iPhone アプリ＋サーバー | C：GitHub Actions の定期実行＋メール通知 |
|---|---|---|---|
| 動作の軽さ | ◎ | ◎ | ○ |
| 配布サイズ | ◎ 入れるものなし（ホーム画面に追加） | △ App Store 経由 | ◎ |
| 作りやすさ | ◎ | △ 審査・署名・サーバーも別に必要 | ◎ |
| 対応OS | iPhone・Android・PC すべて | iPhone のみ | すべて（メールのみ） |
| 将来性 | ◎ | ○ | △ 利用者ごとの登録が作りにくい |
| AIでの書きやすさ | ◎ | ○ | ◎ |

**おすすめ：A**。理由：結局サーバーで監視する必要があるので、画面もそこに載せるのが一番少ない部品で済む。iPhone の通知も PWA（ホーム画面に追加したWebアプリ）で受け取れる。

### 2.2 使うもの（2026-11-07 に npm で最新の安定バージョンを確認）
| 部品 | バージョン | 根拠 |
|---|---|---|
| Hono（サーバーの骨組み） | 4.13.17 | https://www.npmjs.com/package/hono |
| Wrangler（Cloudflare への配置道具） | 4.158.0 | https://www.npmjs.com/package/wrangler |
| React（画面） | 19.3.1 | https://www.npmjs.com/package/react |
| Vite（画面の組み立て道具） | 8.3.6 | https://www.npmjs.com/package/vite |
| @vitejs/plugin-react | 6.2.1 | https://www.npmjs.com/package/@vitejs/plugin-react |
| Tailwind CSS（見た目） | 4.3.5 | https://www.npmjs.com/package/tailwindcss |
| @tailwindcss/vite | 4.3.5 | https://www.npmjs.com/package/@tailwindcss/vite |
| vite-plugin-pwa（PWA化） | 2.0.0（Vite 8 対応を確認済み） | https://www.npmjs.com/package/vite-plugin-pwa |
| TypeScript | 7.0.2 | https://www.npmjs.com/package/typescript |
| @cloudflare/workers-types | 5.20261107.1 | https://www.npmjs.com/package/@cloudflare/workers-types |
| write-excel-file（Excel 書き出し） | 4.1.1（2026-06 更新） | https://www.npmjs.com/package/write-excel-file |

- Excel 書き出しの部品比較：`exceljs`（4.4.0）は 2024-12 以降更新が止まっている。`xlsx`（SheetJS）は npm 上の 0.18.5 が古く、最新バージョンは公式サイトからの配布。→ 更新が続いている `write-excel-file` を使う。**画面側（ブラウザ）で作る**のでサーバーの負担なし。iPhone の Safari で保存できるかは実装時に実機で確認する
- CSV は部品を使わず自前で作る。Excel で開いても文字化けしないよう、先頭に BOM（文字コードの目印）を付けた UTF-8 にする

### 2.3 外部の仕組み
- **iPhone のプッシュ通知**：iOS 16.4 以降、ホーム画面に追加した Web アプリだけが通知を受けられる。通知の許可はボタンを押したときにしか出せない。
  根拠：https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications ／ https://documentation.onesignal.com/docs/safari-web-push-for-ios
  → 初回画面で「ホーム画面に追加」の案内を必ず出す（画面 S0）
- **プッシュの送信処理**：定番の `web-push`（npm 4.0.0）は Node.js 専用の部品に依存しているため Workers では動かない見込み（推測）。Workers の標準暗号機能（WebCrypto）で送信処理を書く。**実装時に動作を確認する**
- **メール**：使わない（通知はプッシュだけ、ログインはパスキー）。そのため Cloudflare のメール送信（ベータ・有料プラン必須）も不要
  根拠：https://developers.cloudflare.com/email-service/ ／ https://developers.cloudflare.com/email-routing/send-email/
- **ログイン**：パスキー（顔認証・指紋）。メールアドレスもパスワードも預からない。iPhone は iCloud キーチェーン、Android は Google パスワードマネージャーでパスキーが同期される。端末を失くしたとき用に「引き継ぎコード」（長いランダムな文字列）を設定画面で表示し、保存してもらう
- **Android**：Chrome はホーム画面に追加しなくても通知を受け取れるが、案内は iPhone と同じ手順（ホーム画面に追加）にそろえる
- **通知の許可が取り消された・届かない端末**：送信で失敗が返った端末は登録を消し、次に開いたときに画面の上で「通知が止まっています」と出す

### 2.4 費用の見込み
- メールを使わないので、Workers の無料プランで始められる見込み（推測。定期実行・D1 の無料枠は実装前に公式ページで確認する）
- 利用者が増えたら有料プランに移る

---

## 3. 監視の仕組み

```
定期実行（Cron：6時間ごと）
  └ 監視先リスト（sources）を順番に取得（1サイトあたり間隔を空ける）
      └ メーカー別の読み取り部品（adapter）で「バージョン番号・日付・更新内容・URL」を取り出す
          └ 前回と違えば releases に保存 → 重要度を判定
              └ その機種を登録している人に alerts を作成 → 🔴はすぐ送信、⚪は週まとめへ
```

### 3.0 機種リストの元データ（HOLDLINE のカタログから取り込み）
- 元：kajisho5/holdline の `docs/catalog/catalog-full.json`（14,711機種・918メーカー、2026年9月時点。メーカー公式ページのURL付き）
- 変換：`tools/import_holdline_catalog.py` → `data/catalog.json`（機種リスト）と `data/makers.csv`（メーカー別の数）
- 分類ごとにファームの有無の印を付けた（仮のルール。運営画面で機種ごとに直せる）
  - ファームあり 7,866 ／ 機種による 4,726 ／ なし 2,119（ケーブル・スタンド・スクリーンなど）
  - 操作ソフトを使う分類（OS注意報の対象候補）：4,591
- 機材を追加する画面（S3）の候補は、ファームが「あり」「機種による」の機種だけを出す
- HOLDLINE 側でカタログを見直したら（年1回程度の想定）、同じ手順で取り込み直す

### 3.1 メーカー別の読み取り部品（adapter）
読み取り部品を作る順番は `data/makers.csv` の「ファームあり（現行品）」の多い順を目安にする。
上位：Panasonic 158 ／ Blackmagic Design 138 ／ IMAGENICS 137 ／ Shure 118 ／ Yamaha 116 ／ Sony 105 ／ ATEN 96 ／ Sennheiser 94 ／ AJA 92 ／ Behringer 82 …（Roland は 15位・53機種）

| メーカー | 状態 |
|---|---|
| Roland Pro A/V | 製品ごとの「Updates & Drivers」ページにバージョン番号入りの項目が並ぶことを確認済み（例：V-160HD RCS Ver.3.3.0）。読み取りは作れる見込み |
| Blackmagic Design | サポートセンターのページはあるが、**機械で安定して読めるか未確認**。実装の最初に確認する |
| その他（Panasonic・Sony・ATEN・Yamaha など） | 未調査。最初のバージョンは 2 社から始めて、1社ずつ足す |

- 読み取りに失敗したら、運営（管理画面）に「壊れた監視先」として出す。利用者には「この機種は確認が止まっています」と表示し、黙って止まらないようにする
- 取得先のサイトに負担をかけないよう、同じサイトへの取得は数秒ずつ空ける。利用規約・robots.txt を adapter ごとに確認してから有効にする

### 3.2 OS注意報（F4）
- 監視対象：macOS・Windows・iPadOS の新しいバージョン（取得元は実装時に公式ページで決める）
- 新しいバージョンを見つけたら、登録機材に「操作ソフトがある」印の付いた機種を持つ人へ 🔴 で送る
- 文面：「macOS ○○ が出ました。ATEM Software Control などの対応を確認してから上げてください」＋各機種の公式ページへのリンク

---

## 4. 画面構成（iPhone 縦向き・PWA）

| ID | 画面 | 主な中身 |
|---|---|---|
| S0 | はじめに | ホーム画面に追加の手順（3ステップ）、パスキーで始める、引き継ぎコードで入る |
| S1 | 更新の一覧（ホーム） | 「確認が要る」「あとで見る」の切り替え、更新の一覧（未確認はランプが赤く光る） |
| S2 | 機材 | 登録機材の一覧。状態：最新／更新あり／確認停止中。右上に「＋」 |
| S3 | 機材を追加 | メーカー選択 → 機種検索 → 手元のバージョン（任意）→ 追加 |
| S4 | 機種の詳細 | 最新バージョンと公開日、公式ページへのボタン、手持ちの台の一覧（台ごとに今のバージョン・購入日・最終更新日）、公開されたバージョンの履歴 |
| S8 | 1台ごとの台帳 | 管理番号・シリアル・購入日・購入先・今のバージョン・メモ（編集可）、「アップデートした」ボタン、更新の記録 |
| S7 | 書き出し | 形式（Excel／CSV）、範囲、含める表、見本、書き出すボタン。S2 右上の共有アイコンから開く |
| S6 | 設定 | この端末の通知（許可）、ほかの端末の追加、届け方、まとめて通知する日時、OSの新しいバージョンの通知、引き継ぎコードの表示 |

下のタブ：更新／機材／設定（S0・S3・S4・S7・S8 はタブの外）

---

## 5. 部品の分け方（画面側）
- `AppShell`：上の見出し＋下のタブ
- `AlertCard`：重要度の色帯、機種名、バージョンの変化（旧→新）、日付、自動判定の印
- `SeverityTabs`：🔴／⚪ の切り替え（件数バッジつき）
- `GearRow`：機種名、メーカー、状態の丸（緑＝最新／赤＝更新あり／灰＝確認停止中）
- `VersionTimeline`：バージョンの履歴の縦並び
- `MakerPicker`・`ModelSearch`：追加画面用
- `PushPermissionButton`：iPhone で PWA として開いていないときは「ホーム画面に追加して」案内に切り替わる
- `EmptyState`：何もないときの案内

## 6. 状態管理
- サーバーのデータ（アラート・機材・バージョン）：TanStack Query 相当の仕組みは使わず、最初のバージョンは `fetch` ＋ React の標準機能（`use`／Context）で持つ。量が増えたら見直す
- 画面だけの状態（タブ・入力中の値）：各画面の `useState`
- ログイン状態：HttpOnly の Cookie（JavaScript から読めない保存場所）でサーバー側が管理
- オフライン：最後に読んだアラート一覧を Service Worker でキャッシュし、電波のない現場でも見られるようにする

## 7. データ構造（D1）
```sql
users(id, display_name, created_at, digest_weekday, tz, recovery_hash)   -- メールアドレスは持たない
passkeys(id, user_id, credential_id, public_key, sign_count, created_at)
makers(id, name, slug)
models(id, maker_id, name, slug, has_control_software INTEGER)  -- OS注意報の対象か
sources(id, model_id, url, adapter, status, last_checked_at, last_error)
releases(id, model_id, kind, version, released_on, notes, url, severity, severity_auto INTEGER, found_at)
   -- kind: firmware / software / os
user_gear(id, user_id, model_id, asset_no, serial, purchased_on, purchased_from,
          current_version, last_updated_on, note, created_at)   -- 1行＝1台
gear_updates(id, user_gear_id, from_version, to_version, updated_on, recorded_by, note, created_at)
   -- 購入時は from_version を空にして「購入」として記録
-- チーム（数人で同じ台帳を見る）は v2。recorded_by は今は本人の表示名
alerts(id, user_id, release_id, severity, read_at, sent_push_at, sent_mail_at)
push_subs(id, user_id, endpoint, p256dh, auth, created_at)
os_watch(id, os, version, released_on, url, found_at)
```

## 8. フォルダ構成
```
firmwatch/
├─ docs/            設計書・SVGデザイン
├─ worker/          サーバー（Hono）
│  ├─ src/
│  │  ├─ index.ts         入口（画面の配信＋API）
│  │  ├─ cron.ts          定期実行
│  │  ├─ adapters/        メーカー別の読み取り（roland.ts, blackmagic.ts …）
│  │  ├─ severity.ts      重要度の判定
│  │  ├─ notify/          push.ts（WebCrypto）, mail.ts
│  │  └─ db/              schema.sql, queries.ts
│  ├─ test/        adapter は保存したHTMLで試験する
│  └─ wrangler.jsonc
├─ web/             画面（React＋Vite＋Tailwind、PWA）
│  └─ src/ screens/ components/ lib/
└─ .github/workflows/  試験と配置（main に入ったら自動で配置）
```

## 9. 試験の方針
- adapter：各メーカーのページを保存したファイルで、バージョン番号を正しく取り出せるか試す
- 重要度判定：文言の例で 🔴／⚪ が期待どおりか試す
- 通知：実機の iPhone（ホーム画面に追加した状態）で届くかを確認する
- 書き出し：作った .xlsx・.csv を Excel と Numbers で開き、文字化け・日付の形・列の並びを確認する
- サンプルデータの利用者名・現場名はすべて架空のもの（例：「テスト太郎」「サンプル現場A」）

## 10. 未確認・リスク
- Blackmagic のページを機械で安定して読めるか（未確認）
- Workers でのプッシュ送信処理（実装時に確認）
- Workers 無料プランの枠で足りるか（未確認）
- 各メーカーのサイト利用規約（adapter ごとに確認）
- 名前「FIRMWATCH」は仮。商標・同名サービスは未調査

## 11. 画面デザインの方針（v2、2026-11-07）
- v1 は「黒地に赤1色」「同じ角丸カードの繰り返し」「英字の小見出し」で、AIが作る画面によくある見た目だったので作り直した
- 目立たせるのは**タリーランプ**だけ。赤く光る＝まだ確認していない更新、緑＝最新、消灯＝確認できていない。放送の現場で赤タリーが「注意」を意味するのに合わせた
- 地はアルミ筐体のような明るいグレー（#D5D9DD）、パネルは #F2F3F4、文字は黒。角丸はボタン 6・ランプ 2・一覧は角なし、と役割で変える
- 書体は IBM Plex Sans JP 1つ（数字も同じ書体。等幅の小ラベルは使わない）
- 「出番（現場に持っていく機材）」の機能は外した。ファームウェアの管理だけに絞る

## 12. 実装で決めたこと（2026-11-07）
- **定期チェックは GitHub Actions で動かす**（`.github/workflows/check.yml`、6時間ごと＋毎時のまとめ通知）。Cloudflare の無料プランは定期実行の計算時間が 10 ミリ秒まで（https://developers.cloudflare.com/workers/platform/limits/ ）で、定期実行の数もアカウント全体で 5 つまで。同じアカウントには sw-ars など別のシステムがあるため、枠を使わない。Worker は画面・API・保存だけを受け持つ
- **通知の送信も GitHub Actions**（web-push 4.0.0）。Worker 側で暗号化処理を持たずに済む
- **取得先**（2026-11-07 に robots.txt を確認）
  - Blackmagic Design：`https://www.blackmagicdesign.com/api/support/jp/downloads.json`（全製品の更新を1ファイルで公開。/api/support は禁止されていない、crawl-delay: 1）。機種名 → 更新ソフト（例 ATEM Mini Pro → ATEM Switchers）の対応は `data/sources.json`
  - macOS・iPadOS：Apple Developer の Releases RSS。正式バージョンのみ
  - Windows 11：Microsoft のリリース情報ページ。機能更新のみ（毎月の品質更新は数が多いので対象外）
  - **Roland：自動確認しない**。proav.roland.com の robots.txt が `Disallow: /support/`
  - Apple の gdmf.apple.com は、公開の証明書で TLS を確かめられないため使わない
- **通知の決まり**：取得先ごとに初回は取り込むだけで通知しない。一度に何件も新しいバージョンが見つかったら、いちばん新しい1件だけを通知する。それまでの最新より古い系列の更新（古い OS の保守バージョンなど）は通知しない
- **機種のリスト**：HOLDLINE のカタログのうち、ファームが「あり」「機種による」の 12,592 機種（16章で 11,781 機種に絞った）。自動確認できるのは Blackmagic の 214 機種
- 試験：単体 9 件、通し 31 件、パスキー（Chrome の仮想認証器）6 件、通知（Chrome でサービスワーカーに届ける）3 件
- **鍵を人に作らせない**：定期チェックの本人確認は GitHub Actions の証明（OIDC、宛先 `firmwatch`、`kajisho5/firmwatch` の main だけ）。通知用の鍵（VAPID）は Worker が初回に WebCrypto で作り、D1 の settings に保存して、画面（公開鍵）と定期チェック（両方）に渡す。人が入れるのは Cloudflare の API トークンとアカウント ID だけ

## 13. 製品ページの見張り（推定）（2026-11-07）
- 専用の読み取りがないメーカーは、機種が初めて登録されたときに `page:<機種ID>` の取得先を作り、HOLDLINE カタログの `maker_url`（製品ページ）を見張る。定期チェックは `/internal/watchlist` で一覧を受け取る（登録されている機種だけ）
- 読む前に robots.txt を確かめる（User-agent: * の Allow/Disallow、* と $ に対応）。401/403 は「断っている」と扱う。同じサイトは 1.5 秒以上あける。Shift_JIS・EUC-JP のページは文字コードを見て読む
- 読み取りの決まり（`checker/pagewatch.mjs`）：「ファームウェア」「Firmware」「System Program」「Software」の直後の番号は採る。「Ver」「version」だけの番号は、40 文字以内にファームを指す言葉があるときだけ採る。「以降」「より」が続く番号、対応OS・通信規格（Bluetooth・USB など）・ファイル形式（ID3 など）の番号は採らない
- 実際のページで起きた誤り（Bluetooth 標準規格 Ver 4.2、ID3TAG Ver. 2.4、Shift_JIS の文字化け）は試験に入れてある
- 結果：主なメーカー 45 機種のうち 13 機種で取得、誤りは確認した範囲でなし。取れなかった理由は、ページに記載なし（Shure、TOA、Audio-Technica、Allen & Heath、Kramer、Epson、Extron、Canon など）、機械からのアクセスを断っている（ATEN、JVC、Barco の一部）

## 14. ジャンル・メーカーから選ぶ（案、2026-11-07）

要望：機材を足すとき、名前で探すだけでなく、ジャンルやメーカーからたどって選べるようにする。デザインは `design-browse.svg`（B1〜B4）。**確認待ち。承認までコードは変えない。**

- 元データ：取り込み済みの機種データ（12,592機種）の「ジャンル（7分類）」「種類（59）」「メーカー（811社）」をそのまま使う。新しい取得はしない。
- 画面の流れ
  - B1 機材を追加：検索欄の下に「ジャンルから／メーカーから」の切り替え。ジャンルは機種の多い順で、中に入っている種類の例を添える。
  - B2 ジャンルの中：種類を機種の多い順に並べる。上の検索欄はそのジャンルの中だけを探す。
  - B3 種類の中：メーカーで絞る丸ボタン（横に流せる）と、メーカーごとにまとめた機種の一覧。押すと今の「機種を選んだ後の入力」へ進む。
  - B4 メーカーから：先頭に「持っている機材のメーカー」。その下は英字順、最後に日本語のメーカー（五十音順）。右端の索引をなぞると飛べる。メーカーを押すと B3 と同じ形の一覧になり、丸ボタンは「種類で絞る」に変わる。
- 戻るボタンで1段ずつ戻れる（アドレスにも残すので、iPhone の端からのスワイプでも戻れる）。
- サーバー側：一覧用の取り出し口を1つ足す（ジャンル・種類・メーカーごとの数、絞り込んだ機種の一覧）。データベースの形は変えない。

## 15. アプリ自体の更新のお知らせ（トースト）（案、2026-11-07）

要望：FIRMWATCH 自体に新しいバージョンがあるとき、トースト（画面の下に少し出るお知らせ）で知らせる。デザインは `design-toast.svg`（T1・T2）。**確認待ち。承認までコードは変えない。**

- T1 使っている途中に見つかったとき：画面を勝手に読み込み直さず、タブの上に「新しいバージョンがあります（今のバージョン → 新しいバージョン）」と「更新する」を出す。✕ で閉じられる。閉じても、次に開いたとき・ほかのアプリから戻ったときに切り替わる。
- T2 開いたとき・ほかのアプリから戻ったときに見つかったとき：画面を見ていない間なので、そのまま切り替える。切り替えたあとに「0.6.1 に更新しました」を4秒ほど出して消える。
- 入力の途中は、どちらの場合も切り替えない（T1 を出すだけ）。今の上の黒い帯は、このトーストに置き換える。
- 見つけ方は今と同じ（開いたとき・戻ったとき・30分ごとに、公開中のバージョンを確かめる）。

## 16. ファームがまずない種類を外す（2026-11-07）

ユーザーの判断（案B）：元データで「ファームはたぶんある」とされた種類のうち、ファームがまずないものを一覧から外す。`migrations/0006_exclude_no_firmware.sql`。

- 外した種類（すべて「たぶんある」のみ。「ある」とされた機種は含まれない）：音響「その他音響」（ヘッドホン・ターンテーブルなど）、PC「プレゼン周辺」「ノートPC」「タブレット」「デスクトップPC」（OS の新しいバージョンは F4 で別に知らせる）、電源・特機「電源」（充電器・電源タップ）、照明「その他」「ピンスポット」「効果機材」。計 811 機種。
- 残した種類：モニター、スピーカー、サブウーファー、レンズ、分配器、撮影用ライト、LED灯体、UPS など（業務用はファームを持つものが多い）。
- すでに誰かが登録している機種は消さない。外した種類でも「手で入力」で登録はできる。
- 結果：11,781 機種・724 メーカー。
