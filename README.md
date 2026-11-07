<p align="center"><img src="web/public/icon-192.png" width="96" alt=""></p>

<h1 align="center">FIRMWATCH</h1>

<p align="center">持っている機材のファームウェアを管理し、新しいバージョンが出たらスマホに通知します。</p>

- 機材を1台ずつ登録（管理番号・シリアル番号・購入日・今のバージョン・更新の記録）
- メーカーが新しいバージョンを公開したら、iPhone・Android に通知（ホーム画面に追加したアプリで受け取る。メールは使わない）
- 「確認が要る更新」はすぐ、「あとで見る更新」は週1回まとめて通知
- macOS・Windows・iPadOS の新しいバージョンも通知（操作ソフトを使う機材を持っている人だけ）
- 台帳を Excel・CSV に書き出し
- ログインはパスキー（顔認証・指紋）。メールアドレスもパスワードも預からない

## 自動で確認しているもの

| 取得先 | 方法 | 対象 |
|---|---|---|
| Blackmagic Design | 公式サポートの公開データ（`/api/support/jp/downloads.json`） | ATEM・HyperDeck・Video Assist・Videohub・コンバーター・カメラなど 214 機種 |
| macOS・iPadOS | Apple Developer の Releases RSS | 正式版のみ（ベータ・RC は除く） |
| Windows 11 | Microsoft のリリース情報ページ | 機能更新（25H2 など）のみ |
| **そのほかのメーカー（推定）** | 登録された機種の、メーカーの製品ページ | 「ファームウェア Ver.○○」「System Program Ver.○○」のような記載を読み取る |

- 読む前に、そのサイトの robots.txt（機械での読み取りのルール）を毎回確かめ、禁止されていないページだけを読みます。同じサイトは間をあけて読みます。
- 製品ページの読み取りは推定です。画面には「推定」と出します。ページにバージョンが載っていない機種や、機械からのアクセスを断っているサイト（ATEN、JVC、Barco の一部など）は確認できず、理由を画面に出します。
- 2026-11-07 に主なメーカーの 45 機種で試したところ、13 機種（Yamaha、Sennheiser、AJA、Behringer、Roland、TASCAM、Datavideo）でバージョンを読み取れました。
- Roland は更新ページ（/support/）が禁止されているため読みません。製品ページは禁止されておらず、「System Program Ver.○○」が載っているので、そこを読みます。

機種のリスト（12,592機種）は、[HOLDLINE](https://github.com/kajisho5/holdline) の機材カタログから取り込んでいます（`tools/import_holdline_catalog.py` → `tools/build_seed.py`）。

## しくみ

```
[GitHub Actions 定期チェック 6時間ごと]  checker/run.mjs
   メーカー・OSの公開情報を読む → Worker に渡す → 返ってきた通知を Web Push で送る
                 │
[Cloudflare Workers「firmwatch」]  worker/src
   画面（PWA）・API・D1（データベース）
                 │
[iPhone・Android のホーム画面のアプリ]  web/src
```

定期チェックを GitHub Actions で動かすのは、Cloudflare の無料プランだと定期実行の計算時間が 10 ミリ秒までで、Blackmagic の公開データ（約 1.8MB）を読み切れないためです。

## 技術

Cloudflare Workers ＋ Hono 4.13 ＋ D1 ／ React 19 ＋ Vite 8 ＋ Tailwind CSS 4（PWA）／ パスキー：SimpleWebAuthn 14 ／ 通知：web-push 4 ／ Excel：write-excel-file 4 ／ 書体：IBM Plex Sans JP

設計：[docs/design.md](docs/design.md)、画面デザイン：`docs/design-*.svg`

## 公開のしかた

GitHub のリポジトリの Secrets に次の2つを入れると、main に入るたびに Cloudflare へ自動で公開されます。

| 名前 | 中身 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare の API トークン（Workers の編集と D1 の編集ができるもの） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |

- 公開先は `https://firmwatch.<アカウントのサブドメイン>.workers.dev` です。
- 通知用の鍵（VAPID）はサーバーが初回に自分で作って保存します。
- 定期チェックの本人確認は GitHub Actions の証明（OIDC）で行います。`kajisho5/firmwatch` の main からの実行だけを受け付けます。
- 公開で作る・変えるのは、Worker「firmwatch」と D1「firmwatch」だけです。同じアカウントにある別のシステムには触れません。

## 開発

```sh
npm ci
npm run typecheck && npm test   # 型と単体試験
npm run test:e2e                # まっさらなローカルDBで、通し・パスキー・通知の試験
npm run dev                     # 画面を組み立てて、ローカルで起動（.dev.vars に DEV_AUTH=1 など）
```

試験・画面確認のデータは、名前・番号・バージョン・日付すべて架空のものです。
