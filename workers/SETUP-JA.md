# ScriptMaker 共有Worker セットアップ手順

## 事前確認

Cloudflare APIトークンには最低限、次の権限が必要です。

- Account: Cloudflare Workers Scripts: Edit
- Account: Workers KV Storage: Edit
- Account: Account Settings: Read

トークンはチャットへ貼らず、PowerShellやCloudflare画面だけで扱ってください。

## スマホだけで設定する場合

Cloudflare Dashboardで設定します。

1. Cloudflareにログインします。
2. `Workers & Pages` を開きます。
3. `KV` を開き、namespaceを作成します。
   - 名前: `SCRIPTMAKER_SHARES`
4. `Workers & Pages` に戻り、Workerを作成します。
   - Worker名: `scriptmaker-share`
5. Workerのコード編集画面で、`workers/share-worker.js` の内容を貼り付けます。
6. Workerの `Settings` を開きます。
7. `Bindings` でKV bindingを追加します。
   - Variable name: `SHARES`
   - KV namespace: `SCRIPTMAKER_SHARES`
8. `Variables and Secrets` で環境変数を追加します。
   - `PUBLIC_VIEWER_URL` = `https://malomalo413.github.io/ScriptMaker/Viewer`
   - `ALLOWED_ORIGIN` = `https://malomalo413.github.io`
   - `SHARE_TTL_SECONDS` = `15552000`
9. Workerをデプロイします。
10. Worker URLを控えます。
    - 例: `https://scriptmaker-share.your-name.workers.dev`
11. ScriptMakerの共有画面にWorker URLを入力します。

## PCからWranglerで設定する場合

Node.jsとnpmが必要です。

```powershell
npm install
```

APIトークンをPowerShellの現在のウィンドウだけに設定します。

```powershell
$env:CLOUDFLARE_API_TOKEN="取得したAPIトークン"
```

認証確認:

```powershell
npx wrangler whoami
```

KV namespaceを作成:

```powershell
npx wrangler kv namespace create SCRIPTMAKER_SHARES
```

表示された `id` を `wrangler.toml` に設定します。

```toml
[[kv_namespaces]]
binding = "SHARES"
id = "表示されたid"
```

デプロイ:

```powershell
npx wrangler deploy
```

動作確認:

```powershell
curl https://scriptmaker-share.your-name.workers.dev/health
```

`{"ok":true}` が返ればWorkerは動作しています。

## ScriptMaker側の使い方

1. ScriptMakerを開きます。
2. `共有` を押します。
3. `Cloudflare Worker URL` にデプロイ済みWorker URLを入力します。
4. `WorkerでURL作成` または `URLコピー` を押します。
5. 生成されたViewer URLを声優さんに送ります。

Worker URLは端末のlocalStorageに保存されるため、同じ端末では次回以降の入力を省略できます。
