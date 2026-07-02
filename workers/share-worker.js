const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 180;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(value, status = 200, env = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...corsHeaders(env),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function textResponse(value, status = 200, env = {}) {
  return new Response(value, { status, headers: corsHeaders(env) });
}

function makeId() {
  const part = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return 'share_' + Date.now().toString(36) + '_' + part;
}

function cleanId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{6,80}$/.test(id) ? id : '';
}

function shareExpiresAt(env) {
  const ttl = Number(env.SHARE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return ttl > 0 ? Date.now() + ttl * 1000 : 0;
}

async function storeInKV(env, id, stored) {
  const ttl = Number(env.SHARE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  await env.SHARES.put(id, JSON.stringify(stored), ttl > 0 ? { expirationTtl: ttl } : undefined);
}

async function readFromKV(env, id) {
  const raw = await env.SHARES.get(id);
  return raw ? JSON.parse(raw) : null;
}

async function storeInDurableObject(env, id, stored) {
  const objectId = env.SHARE_OBJECT.idFromName(id);
  const stub = env.SHARE_OBJECT.get(objectId);
  const response = await stub.fetch('https://scriptmaker-share.local/share/' + encodeURIComponent(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stored)
  });
  if (!response.ok) throw new Error('Durable Object store failed: ' + response.status);
}

async function readFromDurableObject(env, id) {
  const objectId = env.SHARE_OBJECT.idFromName(id);
  const stub = env.SHARE_OBJECT.get(objectId);
  const response = await stub.fetch('https://scriptmaker-share.local/share/' + encodeURIComponent(id), {
    method: 'GET'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Durable Object read failed: ' + response.status);
  return response.json();
}

async function storeShare(env, id, stored) {
  if (env.SHARE_OBJECT) return storeInDurableObject(env, id, stored);
  if (env.SHARES) return storeInKV(env, id, stored);
  throw new Error('Storage binding SHARE_OBJECT or SHARES is not configured');
}

async function readShare(env, id) {
  if (env.SHARE_OBJECT) return readFromDurableObject(env, id);
  if (env.SHARES) return readFromKV(env, id);
  throw new Error('Storage binding SHARE_OBJECT or SHARES is not configured');
}

export class ShareObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'PUT') {
      const payload = await request.json();
      await this.state.storage.put('payload', payload);
      return jsonResponse({ ok: true });
    }

    if (request.method === 'GET') {
      const payload = await this.state.storage.get('payload');
      if (!payload) return jsonResponse({ error: 'Share not found' }, 404);
      if (payload.expiresAt && Date.now() > payload.expiresAt) {
        await this.state.storage.delete('payload');
        return jsonResponse({ error: 'Share expired' }, 404);
      }
      return jsonResponse(payload);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return textResponse('', 204, env);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return jsonResponse({ ok: true }, 200, env);
    if (request.method === 'POST' && url.pathname === '/share') {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, env); }
      if (!payload || !payload.project || !Array.isArray(payload.project.talks)) return jsonResponse({ error: 'Invalid ScriptMaker share payload' }, 400, env);
      const id = cleanId(payload.shareId) || makeId();
      const now = new Date().toISOString();
      const stored = { ...payload, shareId: id, id, updatedAt: now, createdAt: payload.createdAt || now, expiresAt: shareExpiresAt(env) };
      try {
        await storeShare(env, id, stored);
      } catch (error) {
        return jsonResponse({ error: error.message || 'Share storage failed' }, 500, env);
      }
      const publicViewerUrl = env.PUBLIC_VIEWER_URL || '';
      const result = { id, shareId: id };
      if (publicViewerUrl) result.url = publicViewerUrl.replace(/\/+$/, '') + '/?id=' + encodeURIComponent(id);
      return jsonResponse(result, 200, env);
    }
    const match = url.pathname.match(/^\/share\/([a-zA-Z0-9_-]+)$/);
    if (request.method === 'GET' && match) {
      const id = cleanId(match[1]);
      if (!id) return jsonResponse({ error: 'Invalid id' }, 400, env);
      let share;
      try {
        share = await readShare(env, id);
      } catch (error) {
        return jsonResponse({ error: error.message || 'Share read failed' }, 500, env);
      }
      if (!share) return jsonResponse({ error: 'Share not found' }, 404, env);
      return jsonResponse(share, 200, env);
    }
    return jsonResponse({ error: 'Not found' }, 404, env);
  }
};
