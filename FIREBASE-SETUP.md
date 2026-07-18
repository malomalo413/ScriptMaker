# ScriptMaker Firebase Setup

ScriptMakerはGitHub PagesでEditorを公開し、Firebaseは次の用途に使います。

- Viewer共有データの保存: `scriptShares`
- Editorの手動クラウドプロジェクト保存: `editorProjects`
- Editorのバックアップコード同期: `editorSyncSpaces` / `editorRecoveryCodes`

Googleログインは使いません。Firebase AuthenticationのGoogleプロバイダ設定は不要です。

## Firebase Config

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

## Firestore Rules

Firebase Console > Firestore Database > Rules に、`firestore.rules` の内容を貼り付けて公開してください。

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

    match /editorRecoveryCodes/{codeHash} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly([
        'recoveryCodeHash',
        'syncSpaceId',
        'active',
        'createdAt',
        'updatedAt',
        'disabledAt'
      ])
      && request.resource.data.recoveryCodeHash == codeHash;
      allow delete: if false;
    }

    match /editorSyncSpaces/{syncSpaceId} {
      allow read: if true;
      allow create, update: if request.resource.data.keys().hasOnly([
        'id',
        'schemaVersion',
        'recoveryCodeHash',
        'createdAt',
        'updatedAt'
      ])
      && request.resource.data.id == syncSpaceId;
      allow delete: if false;

      match /states/{stateId} {
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

      match /devices/{deviceId} {
        allow read: if true;
        allow create, update: if request.resource.data.keys().hasOnly([
          'id',
          'name',
          'deviceTokenHash',
          'isActive',
          'registeredAt',
          'lastSyncAt'
        ])
        && request.resource.data.id == deviceId;
        allow delete: if false;
      }
    }
  }
}
```

## Storage Rules

現時点では画像をFirestore本文に含む既存仕様を維持しています。大きな画像をFirebase Storageへ分離する拡張に備えて、`storage.rules` は初期状態では安全側で拒否しています。

```txt
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /editorSyncSpaces/{syncSpaceId}/{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## バックアップコードの使い方

1. Editorを開く
2. 上部の「バックアップ」を押す
3. 「バックアップコードを発行」を押す
4. 表示されたコードをコピーして安全な場所へ保存する
5. 別端末のログイン画面で「バックアップコードを入力」を押す
6. コードを貼り付けて「コードを読み込む」を押す

バックアップコードは復元だけでなく、同じ同期領域へ接続するための秘密コードです。コードを知っている人は台本データを読み込めるため、第三者へ公開しないでください。

## 同期とオフライン

- 端末内のlocalStorage保存は維持します。
- バックアップコード設定済みの端末では、編集後2〜5秒程度でFirestoreへ自動同期します。
- オフライン中は端末内へ保存し、オンライン復帰時に同期を再試行します。
- 競合の完全な差分比較は今後の拡張予定です。現在は上書き前にローカルデータを残す設計を優先しています。

## コード再発行

「バックアップ」画面の「コードを再発行」から新しいコードを発行できます。古いコードは無効化され、新しい端末登録には使えなくなります。すでに接続済みの端末は、保存済みの同期領域IDで継続利用できます。

## Cloud Functionsについて

現在の実装はGitHub Pagesだけで動くクライアント方式です。より強い総当たり対策を入れる場合は、将来的にCloud Functionsでコード検証APIを作り、Firestoreへの直接検索をFunctions経由へ移してください。
