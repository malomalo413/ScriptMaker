# ScriptMaker Google Drive共有設定

ScriptMakerの標準共有方式はGoogle Drive向けの閲覧専用HTML共有です。

Cloudflare WorkersやFirebase Hostingは使いません。

## 仕組み

1. ScriptMaker Editorで `共有` を押す
2. 現在の台本データを埋め込んだ閲覧専用HTMLを生成する
3. HTMLを保存、またはスマホの共有シートからGoogle Driveへ保存する
4. Google Driveで共有リンクを作成する
5. 声優さんへ共有リンクを送る

生成されるHTMLは編集機能を含みません。

## Google Driveへ保存する方法

### スマホの場合

1. ScriptMakerで `共有` を押す
2. `Driveへ共有` を押す
3. 共有シートでGoogle Driveを選ぶ
4. DriveへHTMLファイルを保存する
5. Google Driveアプリで保存したHTMLを開く
6. `共有` または `リンクをコピー` を選ぶ
7. リンクの権限を `リンクを知っている全員が閲覧可` にする
8. そのリンクを声優さんへ送る

### PCの場合

1. ScriptMakerで `共有` を押す
2. `HTML保存` を押す
3. 保存されたHTMLファイルをGoogle Driveへアップロードする
4. Drive上で共有リンクを作成する
5. 作成したリンクをScriptMakerの共有欄へ貼り付ける
6. `URLコピー` でコピーする

## Google Driveリンクについて

Google DriveはHTMLファイルをWebサイトとして完全ホスティングする用途ではありません。

そのため、環境によってはDriveのプレビュー画面やダウンロード画面が先に表示される場合があります。

より確実にワンタップでWeb表示したい場合は、将来的にGoogle Apps Script、Firebase Hosting、またはGitHub Pages + データ保存先方式を検討してください。

今回の実装は、Cloudflare設定なしで運用できることを優先しています。

## 維持される表示

- 閲覧専用
- キャラクター左右表示
- キャラクターアイコン
- 壁紙
- シーン切り替え壁紙
- セリフ番号
- 閲覧パスワード

## Cloudflareについて

Cloudflare Workersは標準共有方式から外しました。

既存コードの一部はバックアップとして残っていますが、通常の共有操作ではGoogle Drive向けHTMLを生成します。
