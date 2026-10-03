# チャット型台本作成アシスタント PWA版

既存のHTML版アプリを、GitHub Pagesで公開しやすいPWA構成に整理した版です。画面構成、操作感、localStorageによる既存データ保存はできるだけ維持しています。

## ファイル構成

```text
index.html            Editor（GitHub Pagesのトップ）
Editor/index.html     Editor（/Editor/ 用。中身は index.html と同じ）
Viewer/               閲覧専用ページ（Firebase Hostingで公開）
css/styles.css
js/
  app/                Editor本体（機能ごとに分割。index.html の順番で読み込む）
    01-core-auth.js          定数・状態・起動パスワード
    02-backup-sync.js        バックアップコードによる端末間同期
    03-data-import.js        データ正規化・キャラクターライブラリ・台本読み込み
    04-storage-projects.js   画像保存・保存処理・元に戻す・プロジェクト一覧
    05-wallpaper.js          壁紙・シーン壁紙・範囲指定の壁紙
    06-characters-display.js キャラクター・表示モード・色設定
    07-timeline-editing.js   トーク表示・編集・ト書き・文字数カウント
    08-share-cloud.js        出力・共有・クラウド同期
    09-ui-startup.js         ドラッグ操作・メニュー・起動処理
  share-crypto.js     共有の暗号化（Viewer/js/share-crypto.js と同じ内容にすること）
  firebase-share.js   Firestoreへの保存・読み込み
  vendor/             外部ライブラリ（SortableJS）
tests/                自動テスト（ブラウザで tests/index.html を開く）
firestore.rules       Firestoreルール（段階1）
firestore.rules.auth  Firestoreルール（段階2：上書き防止）
SECURITY-SETUP.md     セキュリティ設定の反映手順
```

## 自動テスト

ローカルでサーバーを起動し（GitHub Pages上でも可）、`tests/index.html` を開くと自動でテストが実行されます。
すべて緑色で「合格」と表示されれば正常です。コードを変更したら、公開前に一度開いて確認してください。

## セキュリティ設定

Firebase側で行う作業があります。`SECURITY-SETUP.md` を参照してください。

## GitHub Pagesで公開する方法

1. GitHubでリポジトリを作成します。
2. `pwa/` フォルダ内のファイル一式をリポジトリにアップロードします。
3. GitHubのリポジトリ画面で `Settings` を開きます。
4. `Pages` を開きます。
5. `Build and deployment` の `Source` を `Deploy from a branch` にします。
6. `Branch` を `main`、フォルダを `/root` にして保存します。
7. 表示された GitHub Pages のURLへアクセスします。

`pwa` フォルダごと置く場合は、Pagesの公開対象に合わせて `pwa/index.html` が開ける配置にしてください。簡単なのは、`pwa/` の中身をリポジトリ直下に置く方法です。

## スマホのホーム画面に追加する方法

### iPhone / iPad Safari

1. GitHub Pages のURLをSafariで開きます。
2. 共有ボタンを押します。
3. `ホーム画面に追加` を選びます。
4. 名前を確認して `追加` を押します。

### Android Chrome

1. GitHub Pages のURLをChromeで開きます。
2. メニューを開きます。
3. `ホーム画面に追加` または `アプリをインストール` を選びます。
4. 追加を確定します。

## アプリアイコンを変更する方法

以下のファイルを同じ名前で差し替えてください。

- `assets/icons/icon-192.png`
- `assets/icons/icon-512.png`

推奨サイズはそれぞれ `192x192` と `512x512` です。差し替え後、`service-worker.js` の `CACHE_NAME` の末尾を `v2` などに変更すると、端末側のキャッシュ更新が反映されやすくなります。

## オフライン対応について

初回アクセス後、`index.html`、CSS、JS、manifest、アイコン、背景画像はService Workerによりキャッシュされます。オフラインでも最低限アプリ画面を開けます。

外部CDNのSortableJSがオフラインで取得できない場合、ドラッグ削除などSortableに依存する機能は無効になります。ただしアプリ本体は開けるようにしています。

## 既存データについて

アプリ内データはこれまで通り `localStorage` の `script_assistant_data_v21` に保存されます。PWA化により保存キーは変更していません。

注意: URLが変わるとブラウザ上は別アプリ扱いになり、既存localStorageは自動移行されません。同じ公開URLで使い続ける場合は保存データを維持できます。
## Firebase Firestore sharing

The standard sharing flow uses Firebase Firestore. The Editor saves a read-only share payload to Firestore and creates a short Viewer URL:

`https://small-4c16f.web.app/?id=share_id`

See `FIREBASE-SETUP.md` for Firebase project setup, Firestore rules, and `js/firebase-config.js` configuration.

Editor data can be moved between devices with the backup code flow. Open the Editor, choose `バックアップ`, issue a backup code, then enter that code on the other device from the password screen. The code is a secret: anyone who knows it can load the Editor backup data.

Google Drive is kept as an optional HTML export path. Use the share modal's HTML export buttons when you need a standalone read-only HTML file. See `DRIVE-SETUP.md` for that fallback flow.

## Password convenience storage

The Editor can remember the Viewer password entered in the share modal on the current device. The Viewer can also remember a successful password check per share ID on the current device. These values are stored only in browser `localStorage` and are not shared with other devices.

The Editor startup password can also be remembered on the current device when the "save on this device" checkbox is enabled. The Editor saved password hash uses a separate localStorage key from Viewer password storage.

This is a convenience feature, not strong authentication. GitHub Pages is a static site, so Viewer password protection should be treated as lightweight access control for casual sharing.
