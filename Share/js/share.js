const EDITOR_KEY = 'script_assistant_data_v21';
const SHARE_KEY = 'scriptmaker_shares_v1';

function readEditorState() {
  try {
    return JSON.parse(localStorage.getItem(EDITOR_KEY) || '{}');
  } catch (error) {
    console.error('Editor data read failed', error);
    return { projects: {} };
  }
}

function readShares() {
  try {
    return JSON.parse(localStorage.getItem(SHARE_KEY) || '{}');
  } catch (error) {
    console.error('Share data read failed', error);
    return {};
  }
}

function saveShares(shares) {
  localStorage.setItem(SHARE_KEY, JSON.stringify(shares));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/\u0060/g, '&#96;');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function encodePayload(value) {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(byte => { bin += String.fromCharCode(byte); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function viewerUrl(share) {
  const payload = encodePayload({
    shareId: share.id,
    title: share.title,
    updatedAt: share.updatedAt,
    project: share.project
  });
  return 'https://small-4c16f.web.app/#data=' + payload;
}

function renderProjects() {
  const state = readEditorState();
  const select = document.getElementById('projectSelect');
  const projects = state.projects || {};
  select.innerHTML = Object.keys(projects).map(id => '<option value="' + escapeAttr(id) + '">' + escapeHtml(projects[id].title || id) + '</option>').join('');
  if (!select.innerHTML) select.innerHTML = '<option value="">Editor\u306b\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u304c\u3042\u308a\u307e\u305b\u3093</option>';
}

function createShare() {
  const state = readEditorState();
  const projectId = document.getElementById('projectSelect').value;
  if (!projectId || !state.projects?.[projectId]) return;
  const shares = readShares();
  const shareId = 'share_' + Date.now();
  shares[shareId] = {
    id: shareId,
    sourceProjectId: projectId,
    title: state.projects[projectId].title || '\u53f0\u672c',
    project: clone(state.projects[projectId]),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    options: { isPublic: true, expiresAt: null, passwordEnabled: false }
  };
  saveShares(shares);
  renderShares();
}

function updateShare(id) {
  const state = readEditorState();
  const shares = readShares();
  const share = shares[id];
  if (!share || !state.projects?.[share.sourceProjectId]) return;
  share.project = clone(state.projects[share.sourceProjectId]);
  share.title = share.project.title || share.title;
  share.updatedAt = new Date().toISOString();
  saveShares(shares);
  renderShares();
}

function deleteShare(id) {
  if (!confirm('\u3053\u306e\u5171\u6709\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f')) return;
  const shares = readShares();
  delete shares[id];
  saveShares(shares);
  renderShares();
}

async function copyShare(id) {
  const shares = readShares();
  const url = viewerUrl(shares[id]);
  try {
    await navigator.clipboard.writeText(url);
    alert('\u5171\u6709URL\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f');
  } catch (error) {
    prompt('\u5171\u6709URL', url);
  }
}

function openShare(id) {
  const shares = readShares();
  window.open(viewerUrl(shares[id]), '_blank');
}

function renderShares() {
  const list = document.getElementById('shareList');
  const values = Object.values(readShares()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (!values.length) {
    list.innerHTML = '<p>\u307e\u3060\u5171\u6709\u306f\u3042\u308a\u307e\u305b\u3093\u3002</p>';
    return;
  }
  list.innerHTML = values.map(share => {
    const url = viewerUrl(share);
    return '<article class="share-item"><h3>' + escapeHtml(share.title) + '</h3><p>\u66f4\u65b0: ' + escapeHtml(new Date(share.updatedAt).toLocaleString()) + '</p><div class="share-actions"><input readonly value="' + escapeAttr(url) + '"><button onclick="copyShare(\'' + escapeAttr(share.id) + '\')">URL\u30b3\u30d4\u30fc</button><button onclick="updateShare(\'' + escapeAttr(share.id) + '\')">\u66f4\u65b0</button><button onclick="openShare(\'' + escapeAttr(share.id) + '\')">Viewer</button><button class="danger" onclick="deleteShare(\'' + escapeAttr(share.id) + '\')">\u524a\u9664</button></div></article>';
  }).join('');
}

window.addEventListener('load', () => {
  renderProjects();
  renderShares();
});
