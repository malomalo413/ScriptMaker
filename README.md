# チャット型台本作成アシスタント PWA版

既存のHTML版アプリを、GitHub Pagesで公開しやすいPWA構成に整理した版です。画面構成、操作感、localStorageによる既存データ保存はできるだけ維持しています。

## ファイル構成

```text
pwa/
  index.html
  manifest.json
  service-worker.js
  css/
    styles.css
  js/
    app.js
  assets/
    icons/
      icon-192.png
      icon-512.png
    images/
      opening-background.png
```

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
## Google Drive共有機能

ScriptMakerの標準共有方式はGoogle Drive向けの閲覧専用HTML共有です。

使い方、Google Driveへの保存方法、声優さんへ共有リンクを送る手順は `DRIVE-SETUP.md` を確認してください。
