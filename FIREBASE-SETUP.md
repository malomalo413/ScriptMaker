# ScriptMaker Firebase Firestore 共有設定

ScriptMakerの標準共有方式は Firebase Firestore です。GitHub Pagesはそのまま使い、Firebase Hostingは使いません。

## 1. 前提

- Firebaseプロジェクトを作成済み
- Firestore Databaseを作成済み
- Firestoreは Standard / asia-northeast1 (Tokyo) / 本番環境モード
- ScriptMakerは GitHub Pages で公開

## 2. Firebase config

`js/firebase-config.js` にFirebase ConsoleのWebアプリ設定を入れます。

```js
window.SCRIPTMAKER_FIREBASE_CONFIG = window.SCRIPTMAKER_FIREBASE_CONFIG || {
  apiKey: "xxxx",
  authDomain: "xxxx.firebaseapp.com",
  projectId: "xxxx",
  storageBucket: "xxxx.firebasestorage.app",
  messagingSenderId: "xxxx",
  appId: "xxxx",
  measurementId: ""
};
```

## 3. Firestore Security Rules

Firebase Consoleの Firestore Database > ルール に、次のルールを設定してください。

EditorのGoogleアカウント同期を使う場合は、Firebase Console > Authentication > Sign-in method で「Google」を有効にしてください。
承認済みドメインには `malomalo413.github.io` と、ローカル確認用に必要なら `localhost` を追加します。

### Googleログインで必要な確認項目

EditorはGitHub Pages上で動くため、Googleログインは基本的に `signInWithPopup` を使います。
`signInWithRedirect` はFirebase Hosting系ドメインでのみ補助的に使います。

Firebase Consoleで次を確認してください。

1. Authentication > Sign-in method > Google が有効
2. Authentication > Settings > Authorized domains に次を追加
   - `malomalo413.github.io`
   - `small-4c16f.firebaseapp.com`
   - `small-4c16f.web.app`
   - ローカル確認をする場合のみ `localhost`
3. Google Cloud Console > APIs & Services > Credentials で、FirebaseのWeb API keyにHTTP referrer制限を入れている場合は次を許可
   - `https://malomalo413.github.io/*`
   - `https://small-4c16f.firebaseapp.com/*`
   - `https://small-4c16f.web.app/*`
4. OAuthクライアントIDを手動編集している場合は、承認済みJavaScript生成元に次を追加
   - `https://malomalo413.github.io`
   - `https://small-4c16f.firebaseapp.com`
   - `https://small-4c16f.web.app`

`The requested action is invalid.` が表示される場合は、特に `small-4c16f.firebaseapp.com` がAPIキー制限や承認済みドメインから漏れていないか確認してください。Firebase Authの認証ハンドラはこのドメインを経由することがあります。

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /scriptShares/{shareId} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly([
        'id',
        'title',
        'data',
        'chunkCount',
        'schemaVersion',
        'createdAt',
        'updatedAt'
      ]);
      allow delete: if false;

      match /chunks/{chunkId} {
        allow read: if true;
        allow create, update: if request.resource.data.keys().hasOnly(['index', 'data'])
          && request.resource.data.index is int
          && request.resource.data.data is string;
        allow delete: if false;
      }
    }

    match /editorProjects/{projectId} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly([
        'id',
        'title',
        'data',
        'chunkCount',
        'schemaVersion',
        'createdAt',
        'updatedAt'
      ])
      && request.resource.data.id == projectId;
      allow delete: if false;

      match /chunks/{chunkId} {
        allow read: if true;
        allow create, update: if request.resource.data.keys().hasOnly(['index', 'data'])
          && request.resource.data.index is int
          && request.resource.data.data is string;
        allow delete: if false;
      }
    }

    match /editorAccounts/{userId}/editorStates/{stateId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create, update: if request.auth != null
        && request.auth.uid == userId
        && request.resource.data.keys().hasOnly([
          'id',
          'title',
          'data',
          'chunkCount',
          'schemaVersion',
          'createdAt',
          'updatedAt'
        ]);
      allow delete: if false;

      match /chunks/{chunkId} {
        allow read: if request.auth != null && request.auth.uid == userId;
        allow create, update: if request.auth != null
          && request.auth.uid == userId
          && request.resource.data.keys().hasOnly(['index', 'data'])
          && request.resource.data.index is int
          && request.resource.data.data is string;
        allow delete: if false;
      }
    }
  }
}
```

このルールは、共有データの作成・更新・閲覧だけを許可します。削除は許可しません。同じ共有IDへ上書きするため、公開URLを変えずに最新版の台本を配信できます。

## 4. 固定公開URLの使い方

### 初回共有

1. ScriptMaker Editorでプロジェクトを開く
2. 上部の「共有」を押す
3. 必要ならViewer閲覧パスワードを入力する
4. 「公開URLを作成」を押す
5. 「公開URLをコピー」を押して声優さんへ送る

### 公開済み台本の更新

1. 台本を編集する
2. 上部の「共有」を押す
3. 「共有データを更新」を押す
4. URLは変わらず、同じURLで最新版が見られる

### 新しいURLを作り直す

共有画面の「詳細設定・開発者向け」から「新しい公開URLを作り直す」を押します。
旧URLはFirestore上に残りますが、今後の更新は新しいURL側へ反映されます。

URL形式:

```txt
https://small-4c16f.web.app/?id=share_xxxxx
```

## 5. 注意

- Firebase Hostingは不要です。
- Cloudflare Workersは不要です。
- Firestoreには共有用の閲覧データだけが保存されます。
- Editor側の通常保存データはlocalStorageに残ります。
- Viewerは閲覧専用です。
- Google Drive向けHTML共有は補助的な「HTML書き出し」として残っています。
