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

- 各サイトの robots.txt（機械での読み取りのルール）を確認し、禁止されていない場所だけを読んでいます。
- **Roland は自動で確認していません。** proav.roland.com の robots.txt が `/support/`（更新ページがある場所）を禁止しているためです。更新したときは手で記録できます。
- そのほかのメーカーは、ルールを確認しながら1社ずつ足していきます。

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
