# ScriptMaker Firebase Firestore 共有設定

ScriptMakerの標準共有方式は Firebase Firestore です。GitHub Pagesはそのまま使い、Firebase Hostingは使いません。

## 1. 前提

- Firebaseプロジェクトを作成済み
- Firestore Databaseを作成済み
- Firestoreは Standard / asia-northeast1 (Tokyo) / 本番環境モード
- ScriptMakerは GitHub Pages で公開

## 2. Firebase configを取得する

1. Firebase Consoleで対象プロジェクトを開く
2. プロジェクト設定を開く
3. 「マイアプリ」でWebアプリを追加、または既存Webアプリを選ぶ
4. 表示された `firebaseConfig` をコピーする

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

## 3. js/firebase-config.js に設定する

`js/firebase-config.js` を開き、値を入れてください。

```js
window.SCRIPTMAKER_FIREBASE_CONFIG = window.SCRIPTMAKER_FIREBASE_CONFIG || {
  apiKey: "xxxx",
  authDomain: "xxxx.firebaseapp.com",
  projectId: "xxxx",
  storageBucket: "xxxx.appspot.com",
  messagingSenderId: "xxxx",
  appId: "xxxx",
  measurementId: ""
};
```

共有モーダル内の `Firebase config` 入力欄へ一時的に貼り付けても動作確認できます。ただし、声優さんへ送る共有URLを安定運用する場合は `js/firebase-config.js` に設定してGitHub Pagesへ反映する方法を推奨します。

## 4. Firestore Security Rules

Firebase Consoleの Firestore Database > ルール に、まず次のルールを設定してください。

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

このルールは、共有データの作成と閲覧だけを許可します。更新・削除は不可です。

## 5. 共有URLの作り方

1. ScriptMaker Editorを開く
2. 共有したいプロジェクトを開く
3. 上部の「共有」を押す
4. 必要なら Viewer閲覧パスワードを入力する
5. 「FirebaseでURL作成」または「URLコピー」を押す
6. Firestoreへ共有データが保存され、短いViewer URLが表示される

URL形式:

```txt
https://malomalo413.github.io/ScriptMaker/Viewer/?id=share_xxxxx
```

## 6. 声優さんへ送る手順

1. 作成された共有URLをコピーする
2. LINE、メール、Discordなどで送る
3. 受け取った人はURLを押すだけでViewerを開ける
4. 閲覧パスワードを設定している場合は、入力後に台本が表示される

## 7. 注意

- Firebase Hostingは不要です。
- Cloudflare Workersは不要です。
- Firestoreには共有用の閲覧データだけが保存されます。
- Editor側の既存プロジェクト保存データは変更しません。
- Google Drive向けHTML共有は補助的な「HTML書き出し」として残っています。
