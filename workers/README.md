# ScriptMaker Cloudflare Worker Share API

This Worker stores ScriptMaker Viewer share payloads in Cloudflare KV and returns short share IDs.

## API

### `POST /share`

Request body: ScriptMaker share JSON payload.

Response:

```json
{ "id": "share_xxxxx", "url": "https://malomalo413.github.io/ScriptMaker/Viewer/?id=share_xxxxx" }
```

### `GET /share/{id}`

Returns the stored ScriptMaker share JSON.

### `GET /health`

Returns:

```json
{ "ok": true }
```

## Cloudflare Setup

1. Create a Cloudflare account.
2. Open Workers & Pages.
3. Create a Worker and paste `workers/share-worker.js`.
4. Create a KV namespace, for example `SCRIPTMAKER_SHARES`.
5. Add a KV binding to the Worker.

```text
Binding name: SHARES
KV namespace: SCRIPTMAKER_SHARES
```

## Environment Variables

```text
PUBLIC_VIEWER_URL=https://malomalo413.github.io/ScriptMaker/Viewer
ALLOWED_ORIGIN=https://malomalo413.github.io
SHARE_TTL_SECONDS=15552000
```

`SHARE_TTL_SECONDS` is optional. `15552000` is about 180 days.

## Deploy

Dashboard deployment is fine. With Wrangler:

```bash
npx wrangler deploy workers/share-worker.js
```

Configure the KV binding in `wrangler.toml` or in the Cloudflare dashboard.

This repository includes a `wrangler.toml` template. After creating the KV namespace, add the real namespace id to:

```toml
[[kv_namespaces]]
binding = "SHARES"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Configure ScriptMaker

1. Open ScriptMaker Editor.
2. Press the Share button.
3. Enter the deployed Worker URL, for example `https://scriptmaker-share.your-name.workers.dev`.
4. Press `WorkerでURL作成`.
5. Copy the generated Viewer URL.

The Worker URL is saved in localStorage for future share operations on that device.

## Viewer Behavior

Viewer opens URLs like:

```text
https://malomalo413.github.io/ScriptMaker/Viewer/?id=share_xxxxx&worker=https%3A%2F%2Fscriptmaker-share.your-name.workers.dev
```

When `SCRIPTMAKER_SHARE_WORKER_URL` is configured in `Viewer/js/viewer.js`, the URL can be shortened to:

```text
https://malomalo413.github.io/ScriptMaker/Viewer/?id=share_xxxxx
```

Loading order:

1. localStorage cache
2. Cloudflare Worker `GET /share/{id}`
3. Manual fallback `../Share/data/{id}.json`

## Manual JSON Fallback

1. Press `JSONダウンロード`.
2. Add the downloaded file to `Share/data/{id}.json`.
3. Commit and push it to GitHub.
4. Open `Viewer/?id={id}`.

## Security Note

This is a lightweight static-site share system. Viewer passwords are checked client-side using a hash stored in the share payload. Do not treat this as strong server-side access control.
