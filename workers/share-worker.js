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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return textResponse('', 204, env);
    if (!env.SHARES) return jsonResponse({ error: 'KV binding SHARES is not configured' }, 500, env);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return jsonResponse({ ok: true }, 200, env);
    if (request.method === 'POST' && url.pathname === '/share') {
      let payload;
      try { payload = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400, env); }
      if (!payload || !payload.project || !Array.isArray(payload.project.talks)) return jsonResponse({ error: 'Invalid ScriptMaker share payload' }, 400, env);
      const id = cleanId(payload.shareId) || makeId();
      const now = new Date().toISOString();
      const stored = { ...payload, shareId: id, id, updatedAt: now, createdAt: payload.createdAt || now };
      const ttl = Number(env.SHARE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
      await env.SHARES.put(id, JSON.stringify(stored), ttl > 0 ? { expirationTtl: ttl } : undefined);
      const publicViewerUrl = env.PUBLIC_VIEWER_URL || '';
      const result = { id, shareId: id };
      if (publicViewerUrl) result.url = publicViewerUrl.replace(/\/+$/, '') + '/?id=' + encodeURIComponent(id);
      return jsonResponse(result, 200, env);
    }
    const match = url.pathname.match(/^\/share\/([a-zA-Z0-9_-]+)$/);
    if (request.method === 'GET' && match) {
      const id = cleanId(match[1]);
      if (!id) return jsonResponse({ error: 'Invalid id' }, 400, env);
      const raw = await env.SHARES.get(id);
      if (!raw) return jsonResponse({ error: 'Share not found' }, 404, env);
      return new Response(raw, { status: 200, headers: { ...corsHeaders(env), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return jsonResponse({ error: 'Not found' }, 404, env);
  }
};
