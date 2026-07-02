# ScriptMaker 共有Worker GitHub連携セットアップ

## 目的

CloudflareにGitHubリポジトリを連携するだけで、`workers/share-worker.js` が自動デプロイされる構成です。

手動でWorkerコードを貼り付ける必要はありません。

## 重要な変更

保存先はKVではなく Durable Objects を使います。

理由:

- KVはnamespace IDを `wrangler.toml` に入れる必要があり、スマホ運用だと手順が増える
- Durable Objectsは `wrangler.toml` に設定を書いておけば、Cloudflareのデプロイ時に自動で作成される
- GitHub連携後は、GitHubへpushするだけでWorkerが更新される

## Cloudflareで最初に1回だけやること

### 1. Cloudflareにログイン

スマホブラウザでCloudflareにログインします。

### 2. Workers & Pagesを開く

Cloudflare Dashboardで `Workers & Pages` を開きます。

### 3. GitHubリポジトリをインポート

1. `Create application` を押す
2. `Import a repository` を選ぶ
3. GitHubを連携する
4. `malomalo413/ScriptMaker` を選ぶ

### 4. Worker設定

以下のように設定します。

```text
Project name / Worker name:
scriptmaker-share

Production branch:
main

Root directory:
/

Build command:
npm run build

Install command:
npm install

Deploy command:
npx wrangler deploy
```

`wrangler.toml` がリポジトリ直下にあるため、Cloudflareはこの設定を読んでWorkerをデプロイします。

### 5. 環境変数

基本的には `wrangler.toml` に入っているため追加不要です。

設定済み:

```text
PUBLIC_VIEWER_URL=https://malomalo413.github.io/ScriptMaker/Viewer
ALLOWED_ORIGIN=https://malomalo413.github.io
SHARE_TTL_SECONDS=15552000
```

### 6. KV設定

不要です。

この構成ではKVを使わないため、KV namespace作成やBinding設定は不要です。

### 7. Durable Objects設定

手動設定は不要です。

`wrangler.toml` に以下が入っているため、デプロイ時に自動設定されます。

```toml
[[durable_objects.bindings]]
name = "SHARE_OBJECT"
class_name = "ShareObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["ShareObject"]
```

### 8. Save and Deploy

`Save and Deploy` を押します。

成功するとWorker URLが発行されます。

例:

```text
https://scriptmaker-share.xxxxx.workers.dev
```

## ScriptMakerで使う

1. ScriptMakerを開く
2. `共有` を押す
3. `Cloudflare Worker URL` に発行されたWorker URLを入力する
4. `WorkerでURL作成` または `URLコピー` を押す
5. 作成されたViewer URLを声優さんへ送る

同じ端末ではWorker URLがlocalStorageに保存されるため、次回以降は再入力を省略できます。

## 今後の運用

今後Workerコードを変更した場合は、GitHubへpushするだけでCloudflareが自動デプロイします。

手動でWorkerコードを貼り替える必要はありません。

## 動作確認

Worker URLの末尾に `/health` を付けて開きます。

```text
https://scriptmaker-share.xxxxx.workers.dev/health
```

次のように表示されれば成功です。

```json
{ "ok": true }
```

## 参考

- Cloudflare Workers Builds: GitHub連携でpush時に自動デプロイ
- Cloudflare Durable Objects: Worker内で使える永続ストレージ
