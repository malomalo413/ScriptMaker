# ScriptMaker Firebase共有設定（旧方式）

現在のScriptMakerの標準共有方式はGoogle Drive向けHTML共有です。

このファイルは、Firestore共有方式を再利用したい場合の参考資料として残しています。

GitHub Pagesはそのまま使います。Firebase Hostingは使いません。

## 1. Firebaseプロジェクトを作成

1. Firebase Consoleを開く
2. `プロジェクトを追加` を押す
3. 任意のプロジェクト名を入力
4. Google Analyticsは不要ならOFF
5. プロジェクトを作成

## 2. Webアプリを追加

1. Firebaseプロジェクト画面でWebアイコン `</>` を押す
2. アプリ名を入力
3. Firebase Hostingは有効化しない
4. 表示された `firebaseConfig` をコピー

例:

```js
const firebaseConfig = {
  apiKey: "xxxx",
  authDomain: "xxxx.firebaseapp.com",
  projectId: "xxxx",
  storageBucket: "xxxx.appspot.com",
  messagingSenderId: "xxxx",
  appId: "xxxx"
};
```

## 3. ScriptMakerにFirebase configを設定

短い共有URLを声優さん側でも開けるようにするには、リポジトリ内の `js/firebase-config.js` にFirebase configを設定してください。

```js
window.SCRIPTMAKER_FIREBASE_CONFIG = {
  apiKey: "xxxx",
  authDomain: "xxxx.firebaseapp.com",
  projectId: "xxxx",
  storageBucket: "xxxx.appspot.com",
  messagingSenderId: "xxxx",
  appId: "xxxx"
};
```

編集画面の共有モーダルにもFirebase config入力欄があります。これは同じ端末での上書き・検証用です。

声優さんへ送るURLを短く保つには、`js/firebase-config.js` に設定してGitHub Pagesへ反映する方法を推奨します。

## 4. Firestoreを有効化

1. Firebase Consoleで `Firestore Database` を開く
2. `データベースを作成` を押す
3. 本番モードで開始
4. ロケーションを選択
5. 作成

## 5. Firestoreセキュリティルール例

ScriptMaker共有はログインなしでURL共有するため、共有データの作成と閲覧だけを許可します。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /scriptShares/{shareId} {
      allow read: if true;
      allow create: if request.resource.data.keys().hasOnly([
        'id',
        'title',
        'chunkCount',
        'schemaVersion',
        'createdAt',
        'updatedAt'
      ]);
      allow update, delete: if false;

      match /chunks/{chunkId} {
        allow read: if true;
        allow create: if request.resource.data.keys().hasOnly(['index', 'data'])
          && request.resource.data.index is int
          && request.resource.data.data is string;
        allow update, delete: if false;
      }
    }
  }
}
```

## 6. 共有URLの作り方

1. ScriptMaker Editorを開く
2. `共有` を押す
3. 必要なら閲覧パスワードを入力
4. Firebase方式を再有効化している場合は `FirebaseでURL作成` または `URLコピー` を押す
5. Firestoreへ保存され、Viewer用URLが作成される

URL例:

```txt
https://malomalo413.github.io/ScriptMaker/Viewer/?id=share_xxxxx
```

## 7. 声優さんへ送る手順

1. 作成されたViewer URLをコピー
2. LINE、メール、Discordなどで送る
3. 声優さんはURLをタップするだけでViewerを開ける
4. 閲覧パスワードを設定している場合は、パスワード入力後に表示される

## 8. 注意点

- Firebase Hostingは不要です。
- GitHub PagesのURLはそのまま使います。
- Firestoreには共有用データだけを保存します。
- Viewerは閲覧専用のままです。
- 画像を多く含む巨大な台本はFirestoreの保存量が増えます。
- Cloudflare Workersは不要です。現在の標準共有方式はGoogle Drive向けHTML共有です。
