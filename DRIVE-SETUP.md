# ScriptMaker Google Drive向けHTML書き出し

ScriptMakerの標準共有方式は Firebase Firestore です。このファイルは、Firebaseを使わずに閲覧専用HTMLをGoogle Driveへ保存して共有したい場合の補助手順です。

## 位置づけ

- 標準: Firebase Firestoreに共有データを保存し、短いViewer URLを発行する
- 補助: 閲覧専用HTMLを書き出し、Google Driveに保存して共有する

Google Drive方式は、環境によってはDriveのプレビュー画面やダウンロード画面が先に表示される場合があります。声優さんにURLを送る標準運用はFirebase方式を推奨します。

## スマホでHTMLを書き出す

1. ScriptMaker Editorでプロジェクトを開く
2. 「共有」を押す
3. 「HTML書き出し」または「Driveへ共有」を押す
4. 生成されたHTMLファイルをGoogle Driveへ保存する
5. Google Driveアプリで保存したHTMLを開く
6. 共有リンクを作成し、権限を「リンクを知っている全員が閲覧可」にする
7. そのリンクを声優さんへ送る

## PCでHTMLを書き出す

1. ScriptMaker Editorでプロジェクトを開く
2. 「共有」を押す
3. 「HTML書き出し」を押す
4. 保存されたHTMLファイルをGoogle Driveへアップロードする
5. Google Drive上で共有リンクを作成する
6. そのリンクを声優さんへ送る

## HTMLに含まれる内容

- 閲覧専用のチャット画面
- キャラクター左右表示
- キャラクターアイコン
- 壁紙
- シーン切り替え壁紙
- セリフ番号
- 閲覧パスワード

## 注意

- 生成されたHTMLには編集機能は含まれません。
- Google DriveはHTMLファイルをWebサイトとして完全ホスティングする用途に最適化されていません。
- 通常の共有操作ではFirebase方式を使ってください。
- Cloudflare Workersは標準共有方式から外しています。
