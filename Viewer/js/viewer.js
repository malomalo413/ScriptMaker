const VIEWER_SCENE_NAME = '\u60c5\u666f\u63cf\u5199';
const VIEWER_SYSTEM_NAME = '\u30b7\u30b9\u30c6\u30e0';
const VIEWER_RIGHT_SIDE_PREFIX = 'scriptmaker_viewer_right_side_v1:';
const SCRIPTMAKER_SHARE_DATA_BASE_URL = '../Share/data/';

let viewerProject = null;
let viewerShareKey = 'default';
let viewerPasswordHash = '';
let pendingViewerProject = null;
let rightSideSetting = { mode: 'editor', names: [] };
let activeLayer = 0;
let currentWallpaperKey = '';
let raf = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function decodePayload(value) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - normalized.length % 4) % 4);
    const bin = atob(normalized + pad);
    const bytes = Uint8Array.from(bin, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    console.error('Viewer decode failed', error);
    return null;
  }
}

function stableShareKey(payload, fallbackProject) {
  if (payload?.shareId) return payload.shareId;
  if (fallbackProject?.id) return fallbackProject.id;
  const raw = location.hash || location.search || location.pathname;
  return 'url_' + raw.slice(0, 80);
}

async function loadSharedProject() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const data = hash.get('data');
  if (data) {
    const payload = decodePayload(data);
    const project = payload?.project || payload;
    viewerShareKey = stableShareKey(payload, project);
    viewerPasswordHash = payload?.viewerPasswordHash || payload?.passwordHash || '';
    return project;
  }
  const params = new URLSearchParams(location.search);
  const shareId = params.get('id') || params.get('share');
  if (shareId) {
    try {
      viewerShareKey = shareId;
      const localShares = JSON.parse(localStorage.getItem('scriptmaker_shares_v1') || '{}');
      let share = localShares[shareId];
      if (!share) {
        const response = await fetch(SCRIPTMAKER_SHARE_DATA_BASE_URL + encodeURIComponent(shareId) + '.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Share not found: ' + response.status);
        share = await response.json();
      }
      viewerPasswordHash = share?.viewerPasswordHash || share?.passwordHash || '';
      return share?.project || null;
    } catch (error) {
      console.error('Viewer share load failed', error);
    }
  }
  viewerShareKey = 'direct_' + location.pathname;
  return null;
}

function isSpecialTalk(talk) {
  return talk.charName === VIEWER_SCENE_NAME || talk.charName === VIEWER_SYSTEM_NAME;
}

function isEditorRightSide(project, name) {
  return !!project.characters?.find(character => character.name === name)?.isProtagonist;
}

function isRightSideCharacter(name) {
  if (rightSideSetting.mode === 'custom') return rightSideSetting.names.includes(name);
  return isEditorRightSide(viewerProject, name);
}

function storageKey() {
  return VIEWER_RIGHT_SIDE_PREFIX + viewerShareKey;
}

function loadRightSideSetting() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    if (stored && (stored.mode === 'custom' || stored.mode === 'editor') && Array.isArray(stored.names)) {
      rightSideSetting = stored;
      return;
    }
  } catch (error) {
    console.warn('Viewer setting load failed', error);
  }
  rightSideSetting = { mode: 'editor', names: [] };
}

function saveRightSideSetting() {
  localStorage.setItem(storageKey(), JSON.stringify(rightSideSetting));
}

function formatNo(index) {
  return String(index + 1).padStart(3, '0');
}

function viewerCharacters(project) {
  const seen = new Set();
  const result = [];
  (project.characters || []).forEach(character => {
    if (!character?.name || seen.has(character.name) || character.name === VIEWER_SCENE_NAME || character.name === VIEWER_SYSTEM_NAME) return;
    seen.add(character.name);
    result.push(character);
  });
  (project.talks || []).forEach(talk => {
    if (!talk?.charName || seen.has(talk.charName) || isSpecialTalk(talk)) return;
    seen.add(talk.charName);
    result.push({ name: talk.charName });
  });
  return result;
}

function characterByName(project, name) {
  return project.characters?.find(item => item.name === name);
}

function avatarHtml(project, talkOrCharacter) {
  const name = talkOrCharacter.charName || talkOrCharacter.name;
  if (name === VIEWER_SCENE_NAME || name === VIEWER_SYSTEM_NAME) return '';
  const character = characterByName(project, name) || talkOrCharacter;
  if (character?.avatar) {
    const radius = character.isRound !== false ? '50%' : '8px';
    return '<div class="viewer-avatar" style="border-radius:' + radius + ';background-image:url(' + character.avatar + ');background-size:' + (character.zoom || 100) + '%;background-position:' + (character.offsetX ?? 50) + '% ' + (character.offsetY ?? 50) + '%"></div>';
  }
  return '<div class="viewer-avatar-dummy">' + escapeHtml((name || '').slice(0, 2)) + '</div>';
}

function renderViewer(project) {
  viewerProject = JSON.parse(JSON.stringify(project));
  loadRightSideSetting();
  document.getElementById('viewerTitle').innerText = viewerProject.title || '\u53f0\u672c';
  renderSettingsOptions();
  renderTimeline();
  applyWallpaper(true);
  const timeline = document.getElementById('viewerTimeline');
  timeline.removeEventListener('scroll', scheduleWallpaper);
  timeline.addEventListener('scroll', scheduleWallpaper, { passive: true });
}

function renderTimeline() {
  const timeline = document.getElementById('viewerTimeline');
  timeline.innerHTML = '';

  (viewerProject.talks || []).forEach((talk, index) => {
    const isSpecial = isSpecialTalk(talk);
    const isRight = !isSpecial && isRightSideCharacter(talk.charName);
    const row = document.createElement('article');
    row.className = 'viewer-talk ' + (isSpecial ? 'scene' : isRight ? 'right' : 'left');
    row.dataset.talkId = talk.id || String(index);
    row.innerHTML = '<span class="viewer-number">' + formatNo(index) + '</span>' + avatarHtml(viewerProject, talk) + '<div class="viewer-bubble"><span class="viewer-name">' + escapeHtml(talk.charName || '') + '</span>' + escapeHtml(talk.text || '') + '</div>';
    timeline.appendChild(row);
  });
}

function renderSettingsOptions() {
  const list = document.getElementById('viewerCharacterOptions');
  if (!list || !viewerProject) return;
  const characters = viewerCharacters(viewerProject);
  if (!characters.length) {
    list.innerHTML = '<p class="viewer-settings-empty">\u8868\u793a\u3067\u304d\u308b\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u304c\u3042\u308a\u307e\u305b\u3093\u3002</p>';
    return;
  }
  list.innerHTML = characters.map(character => {
    const checked = isRightSideCharacter(character.name) ? ' checked' : '';
    return '<label class="viewer-character-option">' +
      '<input type="checkbox" data-name="' + escapeHtml(character.name) + '"' + checked + '>' +
      avatarHtml(viewerProject, character) +
      '<span>' + escapeHtml(character.name) + '</span>' +
      '</label>';
  }).join('');
  list.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', () => {
      const selected = [...list.querySelectorAll('input[type="checkbox"]:checked')].map(item => item.dataset.name);
      rightSideSetting = { mode: 'custom', names: selected };
      saveRightSideSetting();
      renderTimeline();
    });
  });
}

function openSettings() {
  renderSettingsOptions();
  document.getElementById('viewerSettingsPanel').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('viewerSettingsPanel').classList.add('hidden');
}

function setAllLeft() {
  rightSideSetting = { mode: 'custom', names: [] };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
}

function setAllRight() {
  rightSideSetting = { mode: 'custom', names: viewerCharacters(viewerProject).map(character => character.name) };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
}

function useEditorSetting() {
  rightSideSetting = { mode: 'editor', names: [] };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
}


async function hashPasswordText(value) {
  const input = String(value || '');
  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return 'sha256:' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return 'fallback:' + btoa(unescape(encodeURIComponent(input)));
}

function viewerAuthSessionKey() {
  return 'scriptmaker_viewer_auth_ok_v1:' + viewerShareKey;
}

function isViewerAuthorized() {
  return !viewerPasswordHash || sessionStorage.getItem(viewerAuthSessionKey()) === viewerPasswordHash;
}

function showViewerAuth(project) {
  pendingViewerProject = project;
  document.getElementById('viewerAuthPanel').classList.remove('hidden');
  document.getElementById('viewerLogoutButton').classList.add('hidden');
  setTimeout(() => document.getElementById('viewerPasswordInput')?.focus(), 80);
}

function finishViewerAuth(project) {
  document.getElementById('viewerAuthPanel').classList.add('hidden');
  if (viewerPasswordHash) document.getElementById('viewerLogoutButton').classList.remove('hidden');
  renderViewer(project);
}

async function submitViewerPassword() {
  const input = document.getElementById('viewerPasswordInput');
  const message = document.getElementById('viewerPasswordMessage');
  const hash = await hashPasswordText(input?.value || '');
  if (hash !== viewerPasswordHash) {
    if (message) message.textContent = '\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3044\u307e\u3059\u3002';
    return;
  }
  sessionStorage.setItem(viewerAuthSessionKey(), viewerPasswordHash);
  if (input) input.value = '';
  if (message) message.textContent = '';
  finishViewerAuth(pendingViewerProject);
}

function logoutViewerAuth() {
  sessionStorage.removeItem(viewerAuthSessionKey());
  document.getElementById('viewerTimeline').innerHTML = '';
  showViewerAuth(viewerProject || pendingViewerProject);
}


function wallpaperIdentity(wallpaper) {
  return wallpaper?.image ? [wallpaper.image.slice(0, 64), wallpaper.size || 100, wallpaper.offsetX ?? 50, wallpaper.offsetY ?? 50].join('|') : 'none';
}

function styleLayer(layer, wallpaper) {
  if (!wallpaper?.image) {
    layer.style.backgroundImage = '';
    return;
  }
  layer.style.backgroundImage = 'url(' + wallpaper.image + ')';
  layer.style.backgroundSize = (wallpaper.size || 100) === 100 ? 'cover' : (wallpaper.size || 100) + '%';
  layer.style.backgroundPosition = (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%';
}

function setWallpaper(wallpaper, key, force = false) {
  if (!force && key === currentWallpaperKey) return;
  const layers = [document.getElementById('viewerWallpaperA'), document.getElementById('viewerWallpaperB')];
  const current = layers[activeLayer];
  const nextIndex = 1 - activeLayer;
  const next = layers[nextIndex];
  styleLayer(next, wallpaper);
  next.classList.add('active');
  current.classList.remove('active');
  activeLayer = nextIndex;
  currentWallpaperKey = key;
}

function currentTalkId() {
  const timeline = document.getElementById('viewerTimeline');
  const rows = [...timeline.querySelectorAll('.viewer-talk')];
  if (!rows.length) return null;
  const rect = timeline.getBoundingClientRect();
  const anchor = rect.top + Math.min(90, Math.max(24, rect.height * 0.18));
  let best = rows[0];
  let distance = Infinity;
  for (const row of rows) {
    const rowRect = row.getBoundingClientRect();
    const target = Math.max(rowRect.top, Math.min(rowRect.bottom, anchor));
    const diff = Math.abs(target - anchor);
    if (diff < distance) {
      best = row;
      distance = diff;
    }
  }
  return best.dataset.talkId;
}

function applyWallpaper(force = false) {
  if (!viewerProject) return;
  const settings = viewerProject.sceneWallpaperSettings;
  if (settings?.enabled) {
    const talkId = currentTalkId();
    const scene = (settings.scenes || []).find(item => item.image && (item.talkIds || []).includes(talkId));
    if (scene) {
      setWallpaper(scene, 'scene:' + scene.id + ':' + wallpaperIdentity(scene), force);
      return;
    }
  }
  setWallpaper(viewerProject.wallpaper || null, 'single:' + wallpaperIdentity(viewerProject.wallpaper), force);
}

function scheduleWallpaper() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    applyWallpaper(false);
  });
}

window.addEventListener('load', async () => {
  document.getElementById('viewerSettingsButton').addEventListener('click', openSettings);
  document.getElementById('viewerSettingsClose').addEventListener('click', closeSettings);
  document.getElementById('viewerSettingsPanel').addEventListener('click', event => {
    if (event.target.id === 'viewerSettingsPanel') closeSettings();
  });
  document.getElementById('viewerAllLeft').addEventListener('click', setAllLeft);
  document.getElementById('viewerAllRight').addEventListener('click', setAllRight);
  document.getElementById('viewerUseEditor').addEventListener('click', useEditorSetting);
  document.getElementById('viewerPasswordSubmit').addEventListener('click', submitViewerPassword);
  document.getElementById('viewerPasswordInput').addEventListener('keydown', event => { if (event.key === 'Enter') submitViewerPassword(); });
  document.getElementById('viewerLogoutButton').addEventListener('click', logoutViewerAuth);

  const project = await loadSharedProject();
  if (!project) {
    document.getElementById('viewerEmpty').classList.remove('hidden');
    return;
  }
  if (!isViewerAuthorized()) {
    showViewerAuth(project);
  } else {
    finishViewerAuth(project);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
});
