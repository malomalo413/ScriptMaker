const VIEWER_SCENE_NAME = '\u60c5\u666f\u63cf\u5199';
const VIEWER_SYSTEM_NAME = '\u30b7\u30b9\u30c6\u30e0';
const VIEWER_RIGHT_SIDE_PREFIX = 'scriptmaker_viewer_right_side_v1:';
const VIEWER_PASSWORD_HASH_PREFIX = 'scriptmaker_viewer_password_hash_v1:';
const VIEWER_COUNT_SETTING_PREFIX = 'scriptmaker_viewer_count_settings_v1:';
const VIEWER_DEFAULT_EXCLUDE_CHARS = '\u3001\u3002\u300c\u300d\uff08\uff09\u30fc\u301c\uff1f\uff01.';
const SCRIPTMAKER_SHARE_DATA_BASE_URL = '../Share/data/';
const SCRIPTMAKER_SHARE_WORKER_URL = '';

let viewerProject = null;
let viewerShareKey = 'default';
let viewerPasswordHash = '';
let pendingViewerProject = null;
let rightSideSetting = { mode: 'editor', names: [] };
let countSetting = { useExcludeChars: false, excludeChars: VIEWER_DEFAULT_EXCLUDE_CHARS, showNumbers: true };
let activeLayer = 0;
let currentWallpaperKey = '';
let raf = 0;
let viewerShareIdMissing = false;

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

function normalizeWorkerUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function workerUrlFromParams(params) {
  return normalizeWorkerUrl(params.get('worker') || SCRIPTMAKER_SHARE_WORKER_URL);
}

function paramsFromFragment(fragment) {
  const clean = String(fragment || '').replace(/^#/, '').replace(/^\?/, '');
  return new URLSearchParams(clean);
}

function readParamFromHref(name) {
  const match = String(location.href || '').match(new RegExp('[?#&]' + name + '=([^&#]+)'));
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
}

function resolveViewerShareInfo() {
  const searchParams = new URLSearchParams(location.search || '');
  const hashParams = paramsFromFragment(location.hash);
  const shareId = searchParams.get('id') || searchParams.get('share') ||
    hashParams.get('id') || hashParams.get('share') ||
    readParamFromHref('id') || readParamFromHref('share') || '';
  const worker = searchParams.get('worker') || hashParams.get('worker') || readParamFromHref('worker') || '';
  console.log('ScriptMaker Viewer URL debug', {
    href: location.href,
    search: location.search,
    hash: location.hash,
    shareId
  });
  return {
    shareId,
    workerUrl: normalizeWorkerUrl(worker || SCRIPTMAKER_SHARE_WORKER_URL),
    searchParams,
    hashParams
  };
}

async function fetchShareFromWorker(shareId, workerUrl) {
  const normalizedWorker = normalizeWorkerUrl(workerUrl);
  if (!normalizedWorker) return null;
  const response = await fetch(normalizedWorker + '/share/' + encodeURIComponent(shareId), { cache: 'no-store' });
  if (!response.ok) throw new Error('Worker share not found: ' + response.status);
  return response.json();
}

function stableShareKey(payload, fallbackProject) {
  if (payload?.shareId) return payload.shareId;
  if (fallbackProject?.id) return fallbackProject.id;
  const raw = location.hash || location.search || location.pathname;
  return 'url_' + raw.slice(0, 80);
}

async function loadSharedProject() {
  viewerShareIdMissing = false;
  const hash = paramsFromFragment(location.hash);
  const data = hash.get('data');
  if (data) {
    const payload = decodePayload(data);
    const project = payload?.project || payload;
    viewerShareKey = stableShareKey(payload, project);
    viewerPasswordHash = payload?.viewerPasswordHash || payload?.passwordHash || '';
    return project;
  }
  const shareInfo = resolveViewerShareInfo();
  const shareId = shareInfo.shareId;
  if (shareId) {
    try {
      viewerShareKey = shareId;
      const localShares = JSON.parse(localStorage.getItem('scriptmaker_shares_v1') || '{}');
      let share = localShares[shareId];
      if (!share && window.ScriptMakerFirebaseShare) {
        try {
          share = await window.ScriptMakerFirebaseShare.loadShare(shareId);
        } catch (firebaseError) {
          console.warn('Viewer Firebase share load failed', firebaseError);
        }
      }
      if (!share) {
        share = await fetchShareFromWorker(shareId, shareInfo.workerUrl);
      }
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
  viewerShareIdMissing = !shareId;
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

function countStorageKey() {
  return VIEWER_COUNT_SETTING_PREFIX + viewerShareKey;
}

function loadCountSetting() {
  try {
    const stored = JSON.parse(localStorage.getItem(countStorageKey()) || 'null');
    countSetting = {
      useExcludeChars: !!stored?.useExcludeChars,
      excludeChars: typeof stored?.excludeChars === 'string' ? stored.excludeChars : VIEWER_DEFAULT_EXCLUDE_CHARS,
      showNumbers: stored?.showNumbers !== false,
    };
  } catch (error) {
    console.warn('Viewer count setting load failed', error);
    countSetting = { useExcludeChars: false, excludeChars: VIEWER_DEFAULT_EXCLUDE_CHARS, showNumbers: true };
  }
}

function saveCountSetting() {
  localStorage.setItem(countStorageKey(), JSON.stringify(countSetting));
}

function formatNo(index) {
  return String(index + 1).padStart(3, '0');
}

function countedText(text) {
  if (!countSetting.useExcludeChars) return text || '';
  const customChars = countSetting.excludeChars || '';
  if (!customChars) return text || '';
  const excluded = new Set([...customChars]);
  return [...(text || '')].filter(char => !excluded.has(char)).join('');
}

function calculateTextCounts(project) {
  const counts = {};
  let total = 0;
  (project?.talks || []).forEach(talk => {
    const count = [...countedText(talk.text)].length;
    total += count;
    const name = talk.charName || '\u672a\u8a2d\u5b9a';
    counts[name] = (counts[name] || 0) + count;
  });
  return { total, counts };
}

function renderCountPanel() {
  const panel = document.getElementById('viewerCountPanel');
  const total = document.getElementById('viewerCountTotal');
  const breakdown = document.getElementById('viewerCountBreakdown');
  const exclude = document.getElementById('viewerExcludeChars');
  const useExclude = document.getElementById('viewerUseExcludeChars');
  const showNumbers = document.getElementById('viewerShowNumbers');
  if (!panel || !total || !breakdown || !viewerProject) return;

  panel.classList.remove('hidden');
  if (exclude && exclude.value !== countSetting.excludeChars) exclude.value = countSetting.excludeChars;
  if (useExclude) useExclude.checked = !!countSetting.useExcludeChars;
  if (showNumbers) showNumbers.checked = countSetting.showNumbers !== false;

  const result = calculateTextCounts(viewerProject);
  total.textContent = '\u5408\u8a08\u6587\u5b57\u6570\uff1a' + result.total + '\u6587\u5b57';
  const entries = Object.entries(result.counts);
  breakdown.innerHTML = entries.length
    ? entries.map(([name, count]) => '<span>' + escapeHtml(name) + '\uff1a' + count + '\u6587\u5b57</span>').join('')
    : '<span>\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u5225\uff1a0\u6587\u5b57</span>';
}

function updateNumberVisibility() {
  document.getElementById('viewerApp')?.classList.toggle('hide-viewer-numbers', countSetting.showNumbers === false);
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
  loadCountSetting();
  document.getElementById('viewerTitle').innerText = viewerProject.title || '\u53f0\u672c';
  document.getElementById('viewerPdfButton')?.classList.remove('hidden');
  renderSettingsOptions();
  renderTimeline();
  renderCountPanel();
  updateNumberVisibility();
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
      updateNumberVisibility();
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
  updateNumberVisibility();
}

function setAllRight() {
  rightSideSetting = { mode: 'custom', names: viewerCharacters(viewerProject).map(character => character.name) };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
  updateNumberVisibility();
}

function useEditorSetting() {
  rightSideSetting = { mode: 'editor', names: [] };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
  updateNumberVisibility();
}

function initCountControls() {
  const exclude = document.getElementById('viewerExcludeChars');
  const useExclude = document.getElementById('viewerUseExcludeChars');
  const showNumbers = document.getElementById('viewerShowNumbers');
  if (useExclude) {
    useExclude.addEventListener('change', () => {
      countSetting.useExcludeChars = useExclude.checked;
      saveCountSetting();
      renderCountPanel();
    });
  }
  if (exclude) {
    exclude.addEventListener('input', () => {
      countSetting.excludeChars = exclude.value || '';
      saveCountSetting();
      renderCountPanel();
    });
  }
  if (showNumbers) {
    showNumbers.addEventListener('change', () => {
      countSetting.showNumbers = showNumbers.checked;
      saveCountSetting();
      updateNumberVisibility();
    });
  }
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

function viewerPasswordStorageKey() {
  return VIEWER_PASSWORD_HASH_PREFIX + viewerShareKey;
}

function savedViewerPasswordHash() {
  return localStorage.getItem(viewerPasswordStorageKey()) || '';
}

function isViewerAuthorized() {
  if (!viewerPasswordHash) return true;
  if (sessionStorage.getItem(viewerAuthSessionKey()) === viewerPasswordHash) return true;
  if (savedViewerPasswordHash() === viewerPasswordHash) {
    sessionStorage.setItem(viewerAuthSessionKey(), viewerPasswordHash);
    return true;
  }
  if (savedViewerPasswordHash()) localStorage.removeItem(viewerPasswordStorageKey());
  return false;
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
  localStorage.setItem(viewerPasswordStorageKey(), viewerPasswordHash);
  if (input) input.value = '';
  if (message) message.textContent = '';
  finishViewerAuth(pendingViewerProject);
}

function clearSavedViewerPassword() {
  localStorage.removeItem(viewerPasswordStorageKey());
  sessionStorage.removeItem(viewerAuthSessionKey());
  const message = document.getElementById('viewerPasswordMessage');
  if (message) message.textContent = '\u4fdd\u5b58\u3057\u305f\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u524a\u9664\u3057\u307e\u3057\u305f\u3002';
  document.getElementById('viewerPasswordInput')?.focus();
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
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
  const anchor = viewportHeight * 0.6;
  const visibleRows = rows.filter(row => {
    const rowRect = row.getBoundingClientRect();
    return rowRect.bottom >= 0 && rowRect.top <= viewportHeight;
  });
  const candidates = visibleRows.length ? visibleRows : rows;
  let current = candidates[0];
  let hasPassedAnchor = false;
  let nearestDistance = Infinity;
  for (const row of candidates) {
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top <= anchor) {
      current = row;
      hasPassedAnchor = true;
      continue;
    }
    const distance = Math.abs(rowRect.top - anchor);
    if (!hasPassedAnchor && distance < nearestDistance) {
      current = row;
      nearestDistance = distance;
    }
  }
  return current.dataset.talkId;
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

function showViewerEmptyMessage() {
  const empty = document.getElementById('viewerEmpty');
  if (!empty) return;
  const title = empty.querySelector('h2');
  const text = empty.querySelector('p');
  if (viewerShareIdMissing) {
    if (title) title.textContent = '\u5171\u6709URL\u306eID\u3092\u8aad\u307f\u53d6\u308c\u307e\u305b\u3093\u3067\u3057\u305f';
    if (text) text.textContent = 'LINE\u5185\u30d6\u30e9\u30a6\u30b6\u306e\u5834\u5408\u306f\u3001\u53f3\u4e0b\u30e1\u30cb\u30e5\u30fc\u304b\u3089\u5916\u90e8\u30d6\u30e9\u30a6\u30b6\u3067\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002';
  }
  empty.classList.remove('hidden');
}

function printViewerPdf() {
  if (!viewerProject) return;
  const countDetails = document.getElementById('viewerCountDetails');
  const wasOpen = !!countDetails?.open;
  if (countDetails) countDetails.open = true;

  const restorePrintState = () => {
    if (countDetails) countDetails.open = wasOpen;
    window.removeEventListener('afterprint', restorePrintState);
  };

  window.addEventListener('afterprint', restorePrintState);
  setTimeout(() => window.print(), 50);
}

window.addEventListener('load', async () => {
  document.getElementById('viewerPdfButton').addEventListener('click', printViewerPdf);
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
  document.getElementById('viewerClearSavedPassword').addEventListener('click', clearSavedViewerPassword);
  document.getElementById('viewerLogoutButton').addEventListener('click', logoutViewerAuth);
  initCountControls();

  const project = await loadSharedProject();
  if (!project) {
    showViewerEmptyMessage();
    return;
  }
  if (!isViewerAuthorized()) {
    showViewerAuth(project);
  } else {
    finishViewerAuth(project);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
});
