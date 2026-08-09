const VIEWER_SCENE_NAME = '\u60c5\u666f\u63cf\u5199';
const VIEWER_SYSTEM_NAME = '\u30b7\u30b9\u30c6\u30e0';
const VIEWER_RIGHT_SIDE_PREFIX = 'scriptmaker_viewer_right_side_v1:';
const VIEWER_PASSWORD_HASH_PREFIX = 'scriptmaker_viewer_password_hash_v1:';
const VIEWER_COUNT_SETTING_PREFIX = 'scriptmaker_viewer_count_settings_v1:';
const VIEWER_SCRIPT_COLOR_PREFIX = 'scriptmaker_viewer_script_colors_v1:';
const VIEWER_DEFAULT_EXCLUDE_CHARS = '\u3001\u3002\u300c\u300d\uff08\uff09\u30fc\u301c\uff1f\uff01.';
const SCRIPTMAKER_SHARE_DATA_BASE_URL = '../Share/data/';
const SCRIPTMAKER_SHARE_WORKER_URL = '';

let viewerProject = null;
let viewerShareKey = 'default';
let viewerPasswordHash = '';
let pendingViewerProject = null;
let rightSideSetting = { mode: 'editor', names: [] };
let countSetting = { useExcludeChars: false, excludeChars: VIEWER_DEFAULT_EXCLUDE_CHARS, showNumbers: true, excludeEmoji: false };
let viewerScriptColorSettings = {};
let activeLayer = 0;
let currentWallpaperKey = '';
let raf = 0;
let viewerShareIdMissing = false;
let viewerLoadErrorType = '';
let printAssetsReadyPromise = Promise.resolve();
let viewerDisplayMode = 'chat';
let viewerRequestedFullscreenForOrientation = false;
const VIEWER_PDF_PAGE_WIDTH = 1123;
const VIEWER_PDF_PAGE_HEIGHT = 794;
const VIEWER_PDF_PAGE_WIDTH_PT = 841.89;
const VIEWER_PDF_PAGE_HEIGHT_PT = 595.28;
const VIEWER_PDF_MAX_UNITS_PER_PAGE = 24;

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

function safeDecodeUrlPart(value) {
  let result = String(value || '');
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(result.replace(/\+/g, ' '));
      if (decoded === result) break;
      result = decoded;
    } catch (error) {
      break;
    }
  }
  return result;
}

function cleanShareId(value) {
  return safeDecodeUrlPart(value || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/[)\].,;]+$/g, '');
}

function readParamFromText(text, name) {
  const source = safeDecodeUrlPart(text || '');
  const direct = source.match(new RegExp('(?:^|[?#&])' + name + '=([^&#?\\s]+)'));
  if (direct) return cleanShareId(direct[1]);
  const hashRoute = source.match(new RegExp('(?:^|[#/])' + name + '(?:/|=)(share_[A-Za-z0-9_-]+)'));
  if (hashRoute) return cleanShareId(hashRoute[1]);
  return '';
}

function readShareIdFromAnyUrlPart() {
  const sources = [
    location.search,
    location.hash,
    location.href,
    safeDecodeUrlPart(location.href),
    safeDecodeUrlPart(location.search),
    safeDecodeUrlPart(location.hash)
  ];
  for (const source of sources) {
    const fromId = readParamFromText(source, 'id');
    if (fromId) return fromId;
    const fromShare = readParamFromText(source, 'share');
    if (fromShare) return fromShare;
    const route = safeDecodeUrlPart(source).match(/#\/id\/(share_[A-Za-z0-9_-]+)|\/id\/(share_[A-Za-z0-9_-]+)/);
    if (route) return cleanShareId(route[1] || route[2]);
    const fallback = safeDecodeUrlPart(source).match(/\bshare_[A-Za-z0-9_-]+\b/);
    if (fallback) return cleanShareId(fallback[0]);
  }
  return '';
}

function resolveViewerShareInfo() {
  const searchParams = new URLSearchParams(location.search || '');
  const hashParams = paramsFromFragment(location.hash);
  const shareId = cleanShareId(
    searchParams.get('id') || searchParams.get('share') ||
    hashParams.get('id') || hashParams.get('share') ||
    readShareIdFromAnyUrlPart()
  );
  const worker = searchParams.get('worker') || hashParams.get('worker') || readParamFromText(location.href, 'worker') || '';
  console.log('ScriptMaker Viewer URL debug', {
    href: location.href,
    search: location.search,
    hash: location.hash,
    resolvedShareId: shareId,
    firestoreDocumentPath: shareId ? 'scriptShares/' + shareId : ''
  });
  return {
    shareId,
    workerUrl: normalizeWorkerUrl(worker || SCRIPTMAKER_SHARE_WORKER_URL),
    searchParams,
    hashParams
  };
}

function viewerFirebaseConfig() {
  const helper = window.ScriptMakerFirebaseShare;
  if (!helper || !window.SCRIPTMAKER_FIREBASE_CONFIG) return null;
  const config = helper.cleanConfig(window.SCRIPTMAKER_FIREBASE_CONFIG);
  return helper.isConfigured(config) ? config : null;
}

function loadViewerScriptOnce(src, globalCheck) {
  if (globalCheck()) return Promise.resolve();
  const existing = [...document.scripts].find(script => script.src.includes(src.split('?')[0]));
  if (existing && existing.dataset.scriptmakerLoading === 'true') {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Script load failed: ' + src)), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.scriptmakerLoading = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Script load failed: ' + src));
    document.head.appendChild(script);
  });
}

async function ensureViewerFirebaseShare() {
  if (!window.SCRIPTMAKER_FIREBASE_CONFIG) {
    await loadViewerScriptOnce('./js/firebase-config.js?v=30', () => !!window.SCRIPTMAKER_FIREBASE_CONFIG);
  }
  if (!window.ScriptMakerFirebaseShare) {
    await loadViewerScriptOnce('./js/firebase-share.js?v=32', () => !!window.ScriptMakerFirebaseShare);
  }
  return {
    helper: window.ScriptMakerFirebaseShare || null,
    config: viewerFirebaseConfig()
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
  viewerLoadErrorType = '';
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
      let share = null;
      let firebase = { helper: window.ScriptMakerFirebaseShare || null, config: viewerFirebaseConfig() };
      console.log('ScriptMaker Viewer Firestore document path', 'scriptShares/' + shareId);
      if (!firebase.helper || !firebase.config) {
        try {
          firebase = await ensureViewerFirebaseShare();
          console.log('ScriptMaker Viewer Firebase config load success', {
            hasHelper: !!firebase.helper,
            hasConfig: !!firebase.config,
            projectId: firebase.config?.projectId || ''
          });
        } catch (firebaseScriptError) {
          console.warn('Viewer Firebase scripts load failed', firebaseScriptError);
          console.log('ScriptMaker Viewer Firebase connection failed', firebaseScriptError);
        }
      }
      if (!firebase.helper || !firebase.config) {
        console.log('ScriptMaker Viewer Firebase connection failed', 'missing config or helper');
        viewerLoadErrorType = 'missing-firebase-config';
        return null;
      }
      if (firebase.helper && firebase.config) {
        try {
          console.log('ScriptMaker Viewer Firebase connection success', {
            projectId: firebase.config.projectId || '',
            firestoreDocumentPath: 'scriptShares/' + shareId
          });
          share = await firebase.helper.loadShare(shareId, firebase.config);
        } catch (firebaseError) {
          console.warn('Viewer Firebase share load failed', firebaseError);
          console.log('ScriptMaker Viewer Firebase connection failed', firebaseError);
          viewerLoadErrorType = 'firebase-connect-failed';
          return null;
        }
      }
      if (!share) {
        try {
          const localShares = JSON.parse(localStorage.getItem('scriptmaker_shares_v1') || '{}');
          share = localShares[shareId] || null;
        } catch (localError) {
          console.warn('Viewer local share fallback failed', localError);
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
      if (!viewerLoadErrorType) viewerLoadErrorType = 'share-not-found';
    }
  }
  viewerShareIdMissing = !shareId;
  if (shareId && !viewerLoadErrorType) viewerLoadErrorType = 'share-not-found';
  viewerShareKey = 'direct_' + location.pathname;
  return null;
}

function isSpecialTalk(talk) {
  return talk.charName === VIEWER_SCENE_NAME || talk.charName === VIEWER_SYSTEM_NAME;
}

function stageDirectionText(talk) {
  return String(talk?.stageDirection || talk?.note || '').trim();
}

function viewerStageDirectionHtml(talk, className = 'viewer-stage-direction') {
  const text = stageDirectionText(talk);
  return text ? '<div class="' + className + '">' + escapeHtml(text) + '</div>' : '';
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

function scriptColorStorageKey() {
  return VIEWER_SCRIPT_COLOR_PREFIX + viewerShareKey;
}

function sanitizeScriptColor(value) {
  return ['red', 'blue', 'green', 'yellow'].includes(value) ? value : '';
}

function scriptColorClassForCharacter(name) {
  const color = sanitizeScriptColor(viewerScriptColorSettings[name] || '');
  return color ? ' script-color-' + color : '';
}

function loadViewerScriptColorSettings() {
  const embedded = {};
  Object.entries(viewerProject?.scriptColorSettings || {}).forEach(([name, color]) => {
    const safeColor = sanitizeScriptColor(color);
    if (name && safeColor) embedded[name] = safeColor;
  });
  try {
    const stored = localStorage.getItem(scriptColorStorageKey());
    viewerScriptColorSettings = stored ? JSON.parse(stored) || {} : embedded;
  } catch (error) {
    console.warn('Viewer script color setting load failed', error);
    viewerScriptColorSettings = embedded;
  }
}

function saveViewerScriptColorSettings() {
  localStorage.setItem(scriptColorStorageKey(), JSON.stringify(viewerScriptColorSettings || {}));
}

function scriptColorSelectHtml(name, value) {
  const options = [
    ['', '\u306a\u3057'],
    ['red', '\u8d64'],
    ['blue', '\u9752'],
    ['green', '\u7dd1'],
    ['yellow', '\u9ec4\u8272']
  ];
  return '<select data-name="' + escapeHtml(name) + '">' + options.map(([color, label]) =>
    '<option value="' + color + '"' + (value === color ? ' selected' : '') + '>' + label + '</option>'
  ).join('') + '</select>';
}

function renderViewerScriptColorOptions() {
  const list = document.getElementById('viewerScriptColorOptions');
  if (!list || !viewerProject) return;
  loadViewerScriptColorSettings();
  const characters = viewerCharacters(viewerProject).filter(character => !isSpecialTalk({ charName: character.name }));
  if (!characters.length) {
    list.innerHTML = '<p class="viewer-settings-empty">\u8a2d\u5b9a\u3067\u304d\u308b\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u304c\u3042\u308a\u307e\u305b\u3093\u3002</p>';
    return;
  }
  list.innerHTML = characters.map(character => {
    const color = sanitizeScriptColor(viewerScriptColorSettings[character.name] || '');
    return '<label class="viewer-script-color-option">' +
      avatarHtml(viewerProject, character) +
      '<span>' + escapeHtml(character.name) + '</span>' +
      scriptColorSelectHtml(character.name, color) +
    '</label>';
  }).join('');
  list.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      const name = select.dataset.name;
      const color = sanitizeScriptColor(select.value);
      if (color) viewerScriptColorSettings[name] = color;
      else delete viewerScriptColorSettings[name];
      saveViewerScriptColorSettings();
      renderTimeline();
      preparePrintPages();
    });
  });
}

function countStorageKey() {
  return VIEWER_COUNT_SETTING_PREFIX + viewerShareKey;
}

function loadViewerDisplayMode() {
  viewerDisplayMode = 'chat';
}

function applyViewerDisplayModeClass() {
  const app = document.getElementById('viewerApp');
  if (!app) return;
  app.classList.toggle('viewer-mode-script', viewerDisplayMode === 'script');
  app.classList.toggle('viewer-mode-chat', viewerDisplayMode !== 'script');
  document.querySelectorAll('input[name="viewerDisplayMode"]').forEach(input => {
    input.checked = input.value === viewerDisplayMode;
  });
  updateViewerOrientationHint(false);
}

function setViewerDisplayMode(mode) {
  viewerDisplayMode = mode === 'script' ? 'script' : 'chat';
  applyViewerDisplayModeClass();
  renderTimeline();
  preparePrintPages();
  updateViewerDesktopChatWallpaperFrame();
  applyWallpaper(true);
  syncViewerOrientationForDisplayMode(true);
}

function isTouchScreenForOrientationLock() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function updateViewerOrientationHint(show) {
  document.getElementById('viewerOrientationHint')?.classList.toggle('hidden', !show);
}

async function requestViewerFullscreenForOrientation() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return true;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    viewerRequestedFullscreenForOrientation = true;
    return true;
  } catch (error) {
    console.warn('Viewer fullscreen request before orientation lock failed', error);
    return false;
  }
}

async function lockViewerLandscapeOrientation(fromUserGesture) {
  if (!isTouchScreenForOrientationLock()) {
    updateViewerOrientationHint(false);
    return;
  }
  if (!screen.orientation?.lock) {
    updateViewerOrientationHint(true);
    return;
  }
  try {
    await screen.orientation.lock('landscape');
    updateViewerOrientationHint(false);
    return;
  } catch (error) {
    console.warn('Viewer landscape orientation lock failed', error);
  }
  if (fromUserGesture && await requestViewerFullscreenForOrientation()) {
    try {
      await screen.orientation.lock('landscape');
      updateViewerOrientationHint(false);
      return;
    } catch (error) {
      console.warn('Viewer landscape orientation lock after fullscreen failed', error);
    }
  }
  updateViewerOrientationHint(true);
}

async function unlockViewerOrientation() {
  updateViewerOrientationHint(false);
  try {
    screen.orientation?.unlock?.();
  } catch (error) {
    console.warn('Viewer orientation unlock failed', error);
  }
  if (viewerRequestedFullscreenForOrientation && document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
    } catch (error) {
      console.warn('Viewer exit fullscreen after orientation unlock failed', error);
    }
  }
  viewerRequestedFullscreenForOrientation = false;
}

function syncViewerOrientationForDisplayMode(fromUserGesture = false) {
  if (viewerDisplayMode === 'script') {
    lockViewerLandscapeOrientation(fromUserGesture);
  } else {
    unlockViewerOrientation();
  }
}

function loadCountSetting() {
  try {
    const stored = JSON.parse(localStorage.getItem(countStorageKey()) || 'null');
    countSetting = {
      useExcludeChars: !!stored?.useExcludeChars,
      excludeChars: typeof stored?.excludeChars === 'string' ? stored.excludeChars : VIEWER_DEFAULT_EXCLUDE_CHARS,
      showNumbers: stored?.showNumbers !== false,
      excludeEmoji: !!stored?.excludeEmoji,
    };
  } catch (error) {
    console.warn('Viewer count setting load failed', error);
    countSetting = { useExcludeChars: false, excludeChars: VIEWER_DEFAULT_EXCLUDE_CHARS, showNumbers: true, excludeEmoji: false };
  }
}

function saveCountSetting() {
  localStorage.setItem(countStorageKey(), JSON.stringify(countSetting));
}

function formatNo(index) {
  return String(index + 1).padStart(3, '0');
}

function countedText(text) {
  let result = text || '';
  if (countSetting.useExcludeChars) {
    const customChars = countSetting.excludeChars || '';
    if (customChars) {
      const excluded = new Set([...customChars]);
      result = [...result].filter(char => !excluded.has(char)).join('');
    }
  }
  if (countSetting.excludeEmoji) {
    result = removeEmojiLikeChars(result);
  }
  return result;
}

function removeEmojiLikeChars(text) {
  return String(text || '').replace(/\p{Extended_Pictographic}[\uFE0F\uFE0E]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\uFE0E]?)*|\p{Emoji_Presentation}/gu, '');
}

function isCountableTalk(talk) {
  return talk?.charName !== VIEWER_SCENE_NAME && talk?.charName !== VIEWER_SYSTEM_NAME;
}

function calculateTextCounts(project) {
  const counts = {};
  let total = 0;
  (project?.talks || []).filter(isCountableTalk).forEach(talk => {
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
  const excludeEmoji = document.getElementById('viewerExcludeEmoji');
  const showNumbers = document.getElementById('viewerShowNumbers');
  if (!panel || !total || !breakdown || !viewerProject) return;

  panel.classList.remove('hidden');
  if (exclude && exclude.value !== countSetting.excludeChars) exclude.value = countSetting.excludeChars;
  if (useExclude) useExclude.checked = !!countSetting.useExcludeChars;
  if (excludeEmoji) excludeEmoji.checked = !!countSetting.excludeEmoji;
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
    result.push(talk.characterSnapshot ? { ...talk.characterSnapshot, name: talk.charName } : { name: talk.charName });
  });
  return result;
}

function characterByName(project, name) {
  return project.characters?.find(item => item.name === name) ||
    project.talks?.find(talk => talk.charName === name && talk.characterSnapshot)?.characterSnapshot;
}

function avatarHtml(project, talkOrCharacter) {
  const name = talkOrCharacter.charName || talkOrCharacter.name;
  if (name === VIEWER_SCENE_NAME || name === VIEWER_SYSTEM_NAME) return '';
  const character = characterByName(project, name) || talkOrCharacter.characterSnapshot || talkOrCharacter;
  if (character?.avatar) {
    const radius = character.isRound !== false ? '50%' : '8px';
    return '<div class="viewer-avatar" style="border-radius:' + radius + ';background-image:url(' + character.avatar + ');background-size:' + (character.zoom || 100) + '%;background-position:' + (character.offsetX ?? 50) + '% ' + (character.offsetY ?? 50) + '%"></div>';
  }
  return '<div class="viewer-avatar-dummy">' + escapeHtml((name || '').slice(0, 2)) + '</div>';
}

function renderViewer(project) {
  viewerProject = JSON.parse(JSON.stringify(project));
  loadRightSideSetting();
  loadViewerScriptColorSettings();
  loadCountSetting();
  loadViewerDisplayMode();
  applyViewerDisplayModeClass();
  syncViewerOrientationForDisplayMode(false);
  document.getElementById('viewerTitle').innerText = viewerProject.title || '\u53f0\u672c';
  document.getElementById('viewerPdfButton')?.classList.remove('hidden');
  renderSettingsOptions();
  renderViewerScriptColorOptions();
  renderTimeline();
  renderCountPanel();
  updateNumberVisibility();
  preparePrintPages();
  applyWallpaper(true);
  const timeline = document.getElementById('viewerTimeline');
  timeline.removeEventListener('scroll', scheduleWallpaper);
  timeline.addEventListener('scroll', scheduleWallpaper, { passive: true });
}

function renderTimeline() {
  const timeline = document.getElementById('viewerTimeline');
  timeline.innerHTML = '';

  if (viewerDisplayMode === 'script') {
    renderViewerScriptTimeline(timeline);
    return;
  }

  (viewerProject.talks || []).forEach((talk, index) => {
    const isSpecial = isSpecialTalk(talk);
    const isRight = !isSpecial && isRightSideCharacter(talk.charName);
    const row = document.createElement('article');
    row.className = 'viewer-talk ' + (isSpecial ? 'scene' : isRight ? 'right' : 'left');
    row.dataset.talkId = talk.id || String(index);
    row.innerHTML = '<span class="viewer-number">' + formatNo(index) + '</span>' + avatarHtml(viewerProject, talk) + '<div class="viewer-bubble"><span class="viewer-name">' + escapeHtml(talk.charName || '') + '</span>' + escapeHtml(talk.text || '') + viewerStageDirectionHtml(talk) + '</div>';
    timeline.appendChild(row);
  });
}

function renderViewerScriptTimeline(timeline) {
  const shell = document.createElement('div');
  shell.className = 'viewer-script-pages';
  shell.innerHTML = buildPrintGroups().map(group => buildScriptPageHtml(group)).join('');
  timeline.appendChild(shell);
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
      preparePrintPages();
    });
  });
}

function openSettings() {
  renderSettingsOptions();
  renderViewerScriptColorOptions();
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
  preparePrintPages();
}

function setAllRight() {
  rightSideSetting = { mode: 'custom', names: viewerCharacters(viewerProject).map(character => character.name) };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
  updateNumberVisibility();
  preparePrintPages();
}

function useEditorSetting() {
  rightSideSetting = { mode: 'editor', names: [] };
  saveRightSideSetting();
  renderSettingsOptions();
  renderTimeline();
  updateNumberVisibility();
  preparePrintPages();
}

function initCountControls() {
  const exclude = document.getElementById('viewerExcludeChars');
  const useExclude = document.getElementById('viewerUseExcludeChars');
  const excludeEmoji = document.getElementById('viewerExcludeEmoji');
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
  if (excludeEmoji) {
    excludeEmoji.addEventListener('change', () => {
      countSetting.excludeEmoji = excludeEmoji.checked;
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

function wallpaperForTalk(talk) {
  const settings = viewerProject?.sceneWallpaperSettings;
  if (settings?.enabled && talk?.id) {
    const scene = (settings.scenes || []).find(item => Array.isArray(item.talkIds) && item.talkIds.includes(talk.id));
    if (scene) return { wallpaper: scene.image ? scene : null, sceneName: scene.name || '' };
  }
  return { wallpaper: viewerProject?.wallpaper || null, sceneName: '' };
}

function printGroupKey(info) {
  const wallpaper = info?.wallpaper;
  return (info?.sceneName || '') + '|' + wallpaperIdentity(wallpaper);
}

function estimatePrintTalkUnits(talk) {
  const textLength = String(talk?.text || '').length;
  const stageLength = stageDirectionText(talk).length;
  return Math.max(1, Math.ceil(textLength / 34)) + (stageLength ? Math.max(1, Math.ceil(stageLength / 28)) : 0);
}

function splitPrintGroupsByPageCapacity(groups) {
  const result = [];
  groups.forEach(group => {
    let current = null;
    let units = 0;
    const flush = () => {
      if (current?.talks.length) result.push(current);
      current = null;
      units = 0;
    };
    group.talks.forEach(entry => {
      const nextUnits = estimatePrintTalkUnits(entry.talk);
      if (current?.talks.length && units + nextUnits > VIEWER_PDF_MAX_UNITS_PER_PAGE) flush();
      if (!current) {
        current = {
          key: group.key,
          sceneName: group.sceneName,
          wallpaper: group.wallpaper,
          talks: [],
          partIndex: 1,
          partCount: 1
        };
      }
      current.talks.push(entry);
      units += nextUnits;
    });
    flush();
  });

  const counts = new Map();
  result.forEach(group => counts.set(group.key, (counts.get(group.key) || 0) + 1));
  const indexes = new Map();
  result.forEach(group => {
    const next = (indexes.get(group.key) || 0) + 1;
    indexes.set(group.key, next);
    group.partIndex = next;
    group.partCount = counts.get(group.key) || 1;
  });
  return result;
}

function buildPrintGroups() {
  const talks = viewerProject?.talks || [];
  const groups = [];
  talks.forEach((talk, index) => {
    const info = wallpaperForTalk(talk);
    const key = printGroupKey(info);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      groups.push({
        key,
        sceneName: info.sceneName,
        wallpaper: info.wallpaper,
        talks: []
      });
    }
    groups[groups.length - 1].talks.push({ talk, index });
  });
  const baseGroups = groups.length ? groups : [{ key: 'empty', sceneName: '', wallpaper: viewerProject?.wallpaper || null, talks: [] }];
  return splitPrintGroupsByPageCapacity(baseGroups);
}

function buildScriptPageHtml(group) {
  const wallpaper = group.wallpaper;
  const title = escapeHtml(viewerProject.title || '\u53f0\u672c');
  const baseSceneTitle = group.sceneName || (wallpaper?.image ? '\u58c1\u7d19\u30b7\u30fc\u30f3' : '\u58c1\u7d19\u306a\u3057');
  const sceneTitle = escapeHtml(baseSceneTitle + (group.partCount > 1 ? ' ' + group.partIndex + '/' + group.partCount : ''));
  const imageHtml = wallpaper?.image
    ? '<img class="viewer-print-wallpaper-image" src="' + escapeHtml(wallpaper.image) + '" alt="' + sceneTitle + '">'
    : '<div class="viewer-print-no-wallpaper">\u58c1\u7d19\u306a\u3057</div>';
  const talkHtml = group.talks.map(({ talk, index }) => {
    const isSpecial = isSpecialTalk(talk);
    const sideClass = isSpecial ? 'scene' : isRightSideCharacter(talk.charName) ? 'right' : 'left';
    return '<div class="viewer-print-talk ' + sideClass + scriptColorClassForCharacter(talk.charName) + '" data-talk-id="' + escapeHtml(talk.id || String(index)) + '">' +
      '<span class="viewer-print-number">' + formatNo(index) + '</span>' +
      '<span class="viewer-print-name">' + escapeHtml(talk.charName || '') + '</span>' +
      '<span class="viewer-print-text">' + escapeHtml(talk.text || '') + '</span>' +
      '<span class="viewer-print-stage-direction">' + escapeHtml(stageDirectionText(talk)) + '</span>' +
    '</div>';
  }).join('');
  return '<section class="viewer-print-page">' +
    '<header class="viewer-print-head"><h1>' + title + '</h1><p>' + sceneTitle + '</p></header>' +
    '<div class="viewer-print-layout">' +
      '<div class="viewer-print-script">' + talkHtml + '</div>' +
      '<aside class="viewer-print-art">' + imageHtml + '</aside>' +
    '</div>' +
  '</section>';
}

function renderPrintPages() {
  const container = document.getElementById('viewerPrintPages');
  if (!container || !viewerProject) return [];
  container.innerHTML = buildPrintGroups().map(group => buildScriptPageHtml(group)).join('');
  return [...container.querySelectorAll('img')];
}

function waitForPrintImages(images) {
  const tasks = images.map(image => {
    if (image.complete) return Promise.resolve();
    return new Promise(resolve => {
      image.onload = () => resolve();
      image.onerror = () => {
        image.classList.add('viewer-print-image-error');
        image.replaceWith(Object.assign(document.createElement('div'), {
          className: 'viewer-print-no-wallpaper',
          textContent: '\u58c1\u7d19\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f'
        }));
        resolve();
      };
    });
  });
  return Promise.race([
    Promise.all(tasks),
    new Promise(resolve => setTimeout(resolve, 4000))
  ]);
}

function preparePrintPages() {
  if (!viewerProject) return [];
  const images = renderPrintPages();
  printAssetsReadyPromise = waitForPrintImages(images).catch(error => {
    console.warn('Viewer print image preload failed', error);
  });
  return images;
}

function printDocumentStyles() {
  return `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      background: #eef2f7;
      color: #111827;
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
    }
    .viewer-print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: rgba(255, 255, 255, .94);
      border-bottom: 1px solid #d1d5db;
      backdrop-filter: blur(12px);
    }
    .viewer-print-toolbar strong {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
    }
    .viewer-print-toolbar button {
      border: 0;
      border-radius: 9px;
      padding: 10px 14px;
      background: #2563eb;
      color: #fff;
      font-weight: 900;
      font-size: 14px;
      white-space: nowrap;
    }
    .viewer-print-toolbar button.secondary {
      background: #e2e8f0;
      color: #334155;
    }
    .viewer-print-pages {
      display: block;
      padding: 16px;
    }
    .viewer-print-page {
      width: ${VIEWER_PDF_PAGE_WIDTH}px;
      min-height: ${VIEWER_PDF_PAGE_HEIGHT}px;
      max-width: calc(100vw - 32px);
      margin: 0 auto 16px;
      padding: 22px;
      background: #fff;
      box-shadow: 0 10px 30px rgba(15, 23, 42, .14);
      page-break-after: always;
      break-after: page;
    }
    .viewer-print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .viewer-print-head {
      padding: 0 0 8px;
      border-bottom: 2px solid #111827;
      margin-bottom: 12px;
    }
    .viewer-print-head h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.35;
    }
    .viewer-print-head p {
      margin: 3px 0 0;
      color: #475569;
      font-size: 12px;
      font-weight: 800;
    }
    .viewer-print-layout {
      display: grid;
      grid-template-columns: minmax(0, 72%) minmax(220px, 28%);
      gap: 14px;
      align-items: start;
    }
    .viewer-print-script { min-width: 0; }
    .viewer-print-art {
      min-height: 420px;
      border: 1px solid #d1d5db;
      background: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .viewer-print-wallpaper-image {
      display: block;
      max-width: 100%;
      max-height: 760px;
      object-fit: contain;
    }
    .viewer-print-no-wallpaper {
      width: 100%;
      min-height: 260px;
      display: grid;
      place-items: center;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 800;
      text-align: center;
    }
    .viewer-print-talk {
      display: grid;
      grid-template-columns: 36px 78px minmax(0, 1fr) minmax(130px, .58fr);
      gap: 6px;
      margin: 0 0 6px;
      padding-left: 7px;
      border-left: 3px solid #cbd5e1;
      break-inside: avoid;
      page-break-inside: avoid;
      font-size: 12px;
      line-height: 1.6;
      min-width: 0;
      writing-mode: horizontal-tb;
      white-space: normal;
      word-break: normal;
      overflow-wrap: anywhere;
    }
    .viewer-print-talk.right { border-left-color: #3b82f6; }
    .viewer-print-talk.scene {
      grid-template-columns: 36px 78px minmax(0, 1fr) minmax(130px, .58fr);
      border-left-color: #94a3b8;
      background: #f1f5f9;
      padding: 4px 6px;
    }
    .viewer-print-talk.scene .viewer-print-name { color: #64748b; }
    .viewer-print-number { color: #6b7280; font-weight: 900; }
    .viewer-print-name {
      color: #111827;
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .viewer-print-text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: normal;
      writing-mode: horizontal-tb;
    }
    .viewer-print-stage-direction {
      display: block;
      margin-top: 0;
      padding: 4px 6px;
      border-radius: 5px;
      background: #e5e7eb;
      color: #475569;
      font-size: 10px;
      line-height: 1.5;
    }
    .viewer-print-talk.script-color-red { border-left-color: #ef4444; background: #fff1f2; }
    .viewer-print-talk.script-color-red .viewer-print-name,
    .viewer-print-talk.script-color-red .viewer-print-text { color: #991b1b; }
    .viewer-print-talk.script-color-blue { border-left-color: #3b82f6; background: #eff6ff; }
    .viewer-print-talk.script-color-blue .viewer-print-name,
    .viewer-print-talk.script-color-blue .viewer-print-text { color: #1e3a8a; }
    .viewer-print-talk.script-color-green { border-left-color: #22c55e; background: #f0fdf4; }
    .viewer-print-talk.script-color-green .viewer-print-name,
    .viewer-print-talk.script-color-green .viewer-print-text { color: #166534; }
    .viewer-print-talk.script-color-yellow { border-left-color: #eab308; background: #fefce8; }
    .viewer-print-talk.script-color-yellow .viewer-print-name,
    .viewer-print-talk.script-color-yellow .viewer-print-text { color: #854d0e; }
    @media (max-width: 720px) {
      .viewer-print-pages { padding: 10px; }
      .viewer-print-page {
        min-height: auto;
        padding: 16px;
      }
      .viewer-print-layout {
        grid-template-columns: 1fr;
        gap: 14px;
      }
      .viewer-print-art {
        min-height: 220px;
        order: -1;
      }
      .viewer-print-wallpaper-image {
        max-height: 420px;
      }
    }
    @media print {
      @page { size: A4 landscape; margin: 10mm; }
      html, body {
        width: 277mm;
        height: auto;
        overflow: visible;
        background: #fff !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .viewer-print-toolbar { display: none !important; }
      .viewer-print-pages {
        padding: 0;
      }
      .viewer-print-page {
        width: 277mm;
        max-width: none;
        min-height: 190mm;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      .viewer-print-layout {
        display: grid;
        grid-template-columns: minmax(0, 72%) minmax(0, 28%);
        gap: 5mm;
      }
      .viewer-print-art {
        min-height: 110mm;
        padding: 5mm;
      }
      .viewer-print-wallpaper-image {
        max-height: 210mm;
      }
      .viewer-print-talk {
        font-size: 11px;
      }
    }
  `;
}

function printableDocumentScript() {
  return `
    const PDF_PAGE_WIDTH = ${VIEWER_PDF_PAGE_WIDTH};
    const PDF_PAGE_HEIGHT = ${VIEWER_PDF_PAGE_HEIGHT};
    const PDF_PAGE_WIDTH_PT = ${VIEWER_PDF_PAGE_WIDTH_PT};
    const PDF_PAGE_HEIGHT_PT = ${VIEWER_PDF_PAGE_HEIGHT_PT};
    function setPdfStatus(text, isError) {
      const status = document.getElementById('viewerPrintStatus');
      if (!status) return;
      status.textContent = text || '';
      status.style.color = isError ? '#dc2626' : '#475569';
    }
    function safeFileName(name) {
      const base = String(name || 'ScriptMaker').replace(/[\\\\/:*?"<>|]/g, '_').trim() || 'ScriptMaker';
      const date = new Date().toISOString().slice(0, 10);
      return base + '_' + date + '.pdf';
    }
    function asciiBytes(value) {
      const text = String(value);
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
      return bytes;
    }
    function binaryBytes(binary) {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
      return bytes;
    }
    function concatBytes(parts) {
      const total = parts.reduce((sum, part) => sum + part.length, 0);
      const output = new Uint8Array(total);
      let offset = 0;
      parts.forEach(part => {
        output.set(part, offset);
        offset += part.length;
      });
      return output;
    }
    function jpegBinaryFromDataUrl(dataUrl) {
      return atob(String(dataUrl).split(',')[1] || '');
    }
    function buildPdfFromJpegs(pages) {
      const parts = [];
      const offsets = [0];
      let position = 0;
      const add = part => { parts.push(part); position += part.length; };
      const addAscii = text => add(asciiBytes(text));
      const addObject = (id, bodyParts) => {
        offsets[id] = position;
        addAscii(id + ' 0 obj\\n');
        bodyParts.forEach(part => typeof part === 'string' ? addAscii(part) : add(part));
        addAscii('\\nendobj\\n');
      };
      addAscii('%PDF-1.4\\n%\\xE2\\xE3\\xCF\\xD3\\n');
      const kids = [];
      const pageObjects = [];
      let nextId = 3;
      pages.forEach((page, index) => {
        const pageId = nextId++;
        const contentId = nextId++;
        const imageId = nextId++;
        kids.push(pageId + ' 0 R');
        pageObjects.push({ pageId, contentId, imageId, page, imageName: 'Im' + index });
      });
      addObject(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
      addObject(2, ['<< /Type /Pages /Kids [', kids.join(' '), '] /Count ', String(pages.length), ' >>']);
      pageObjects.forEach(item => {
        addObject(item.pageId, [
          '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PDF_PAGE_WIDTH_PT + ' ' + PDF_PAGE_HEIGHT_PT + '] ',
          '/Resources << /XObject << /' + item.imageName + ' ' + item.imageId + ' 0 R >> >> /Contents ' + item.contentId + ' 0 R >>'
        ]);
        const stream = 'q\\n' + PDF_PAGE_WIDTH_PT + ' 0 0 ' + PDF_PAGE_HEIGHT_PT + ' 0 0 cm\\n/' + item.imageName + ' Do\\nQ\\n';
        addObject(item.contentId, ['<< /Length ' + stream.length + ' >>\\nstream\\n' + stream + 'endstream']);
        const jpeg = binaryBytes(item.page.binary);
        addObject(item.imageId, [
          '<< /Type /XObject /Subtype /Image /Width ' + item.page.width + ' /Height ' + item.page.height,
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\\nstream\\n',
          jpeg,
          '\\nendstream'
        ]);
      });
      const xrefOffset = position;
      addAscii('xref\\n0 ' + nextId + '\\n');
      addAscii('0000000000 65535 f \\n');
      for (let i = 1; i < nextId; i++) addAscii(String(offsets[i]).padStart(10, '0') + ' 00000 n \\n');
      addAscii('trailer\\n<< /Size ' + nextId + ' /Root 1 0 R >>\\nstartxref\\n' + xrefOffset + '\\n%%EOF');
      return new Blob([concatBytes(parts)], { type: 'application/pdf' });
    }
    async function waitForImages() {
      const images = [...document.querySelectorAll('.viewer-print-pages img')];
      await Promise.race([
        Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
          image.onload = resolve;
          image.onerror = resolve;
        }))),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);
      if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
    }
    function colorForTalk(row) {
      if (row.classList.contains('script-color-red')) return '#991b1b';
      if (row.classList.contains('script-color-blue')) return '#1e3a8a';
      if (row.classList.contains('script-color-green')) return '#166534';
      if (row.classList.contains('script-color-yellow')) return '#854d0e';
      return '#111827';
    }
    function fillRoundRect(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
    }
    function wrapCanvasText(ctx, text, maxWidth) {
      const output = [];
      String(text || '').split(/\\r?\\n/).forEach(sourceLine => {
        let line = '';
        Array.from(sourceLine).forEach(char => {
          const next = line + char;
          if (line && ctx.measureText(next).width > maxWidth) {
            output.push(line);
            line = char;
          } else {
            line = next;
          }
        });
        output.push(line);
      });
      return output.length ? output : [''];
    }
    function loadCanvasImage(src) {
      return new Promise(resolve => {
        if (!src || /^data:image\\/svg/i.test(src)) {
          resolve(null);
          return;
        }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
        img.src = src;
      });
    }
    function drawContainImage(ctx, image, x, y, width, height) {
      if (!image) {
        ctx.fillStyle = '#f1f5f9';
        fillRoundRect(ctx, x, y, width, height, 10);
        ctx.fillStyle = '#64748b';
        ctx.font = '16px sans-serif';
        ctx.fillText('壁紙なし', x + 18, y + 34);
        return;
      }
      const ratio = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const drawWidth = image.naturalWidth * ratio;
      const drawHeight = image.naturalHeight * ratio;
      const drawX = x + (width - drawWidth) / 2;
      const drawY = y + (height - drawHeight) / 2;
      ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    }
    async function renderPageToJpeg(page) {
      const scale = Math.min(2, Math.max(1.25, window.devicePixelRatio || 1.5));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(PDF_PAGE_WIDTH * scale);
      canvas.height = Math.round(PDF_PAGE_HEIGHT * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

      const title = page.querySelector('.viewer-print-title')?.textContent?.trim() || document.title.replace(/ PDF$/, '') || 'ScriptMaker';
      const scene = page.querySelector('.viewer-print-scene')?.textContent?.trim() || '';
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 28px sans-serif';
      ctx.fillText(title, 26, 40);
      ctx.font = '700 15px sans-serif';
      ctx.fillText(scene, 28, 66);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(24, 82);
      ctx.lineTo(PDF_PAGE_WIDTH - 24, 82);
      ctx.stroke();

      const artX = 788;
      const artY = 106;
      const artW = 308;
      const artH = 620;
      ctx.fillStyle = '#f8fafc';
      fillRoundRect(ctx, artX - 8, artY - 8, artW + 16, artH + 16, 12);
      const imageSrc = page.querySelector('.viewer-print-wallpaper-image')?.getAttribute('src') || '';
      drawContainImage(ctx, await loadCanvasImage(imageSrc), artX, artY, artW, artH);

      const rows = [...page.querySelectorAll('.viewer-print-talk')];
      const numberX = 30;
      const nameX = 86;
      const textX = 168;
      const stageX = 552;
      const textW = 360;
      const stageW = 210;
      let y = 112;
      rows.forEach(row => {
        if (y > PDF_PAGE_HEIGHT - 42) return;
        const number = row.querySelector('.viewer-print-number')?.textContent?.trim() || '';
        const name = row.querySelector('.viewer-print-name')?.textContent?.trim() || '';
        const text = row.querySelector('.viewer-print-text')?.textContent || '';
        const stage = row.querySelector('.viewer-print-stage-direction')?.textContent || '';
        const isScene = row.classList.contains('scene');
        const color = isScene ? '#475569' : colorForTalk(row);
        ctx.font = '14px sans-serif';
        const textLines = wrapCanvasText(ctx, text, textW);
        const stageLines = wrapCanvasText(ctx, stage, stageW);
        const lineCount = Math.max(textLines.length, stage ? stageLines.length : 1);
        const rowH = Math.max(30, lineCount * 20 + 10);
        if (isScene) {
          ctx.fillStyle = '#f1f5f9';
          fillRoundRect(ctx, numberX - 6, y - 14, stageX + stageW - numberX + 12, rowH, 7);
        }
        ctx.fillStyle = '#e2e8f0';
        fillRoundRect(ctx, numberX - 2, y - 14, 42, 22, 6);
        ctx.fillStyle = '#475569';
        ctx.font = '700 13px sans-serif';
        ctx.fillText(number, numberX + 5, y + 2);
        ctx.fillStyle = color;
        ctx.font = '700 13px sans-serif';
        ctx.fillText(name, nameX, y + 2);
        ctx.font = '14px sans-serif';
        textLines.forEach((line, index) => ctx.fillText(line, textX, y + index * 20 + 2));
        if (stage) {
          ctx.fillStyle = 'rgba(100, 116, 139, 0.18)';
          fillRoundRect(ctx, stageX - 8, y - 14, stageW + 16, rowH - 2, 7);
          ctx.fillStyle = '#475569';
          ctx.font = '13px sans-serif';
          stageLines.forEach((line, index) => ctx.fillText(line, stageX, y + index * 19 + 2));
        }
        y += rowH + 4;
      });

      return { binary: jpegBinaryFromDataUrl(canvas.toDataURL('image/jpeg', 0.92)), width: canvas.width, height: canvas.height };
    }
    async function savePdfBlob(blob, fileName) {
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (error) {
          if (error && error.name === 'AbortError') throw error;
          console.warn('File picker failed, falling back to download', error);
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async function downloadViewerPdf() {
      const button = document.getElementById('viewerDownloadPdfButton');
      try {
        if (button) {
          button.disabled = true;
          button.textContent = 'PDF生成中...';
        }
        setPdfStatus('画像とページを準備しています...', false);
        await waitForImages();
        const pages = [...document.querySelectorAll('.viewer-print-page')];
        if (!pages.length) throw new Error('No print pages.');
        const rendered = [];
        for (let i = 0; i < pages.length; i++) {
          setPdfStatus('PDF生成中... ' + (i + 1) + ' / ' + pages.length, false);
          rendered.push(await renderPageToJpeg(pages[i]));
        }
        const blob = buildPdfFromJpegs(rendered);
        await savePdfBlob(blob, safeFileName(document.title.replace(/ PDF$/, '')));
        setPdfStatus('PDFを保存しました。', false);
      } catch (error) {
        console.error('PDF download failed', error);
        if (error?.name === 'AbortError') setPdfStatus('PDF保存をキャンセルしました。', false);
        else setPdfStatus('PDFを生成できませんでした。印刷ボタンをお試しください。', true);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'PDFをダウンロード';
        }
      }
    }
    window.downloadViewerPdf = downloadViewerPdf;
  `;
}

function buildPrintableHtml() {
  const pages = document.getElementById('viewerPrintPages')?.innerHTML || '';
  const title = escapeHtml(viewerProject?.title || '\u53f0\u672c');
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + ' PDF</title><style>' + printDocumentStyles() + '</style></head>' +
    '<body><div class="viewer-print-toolbar"><strong>' + title + '</strong><span id="viewerPrintStatus"></span>' +
    '<button id="viewerDownloadPdfButton" type="button" onclick="downloadViewerPdf()">PDF&#12434;&#12480;&#12454;&#12531;&#12525;&#12540;&#12489;</button><button class="secondary" type="button" onclick="window.print()">&#21360;&#21047;</button></div>' +
    '<main class="viewer-print-pages">' + pages + '</main>' +
    '<script>' + printableDocumentScript() + '<\/script>' +
    '</body></html>';
}

function openPrintableWindow() {
  const html = buildPrintableHtml();
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const useSameTab = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 768;
  if (useSameTab) {
    window.location.href = url;
    return false;
  }

  const popup = window.open(url, '_blank', 'noopener');
  if (popup) {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  window.location.href = url;
  return false;
}

function styleLayer(layer, wallpaper) {
  updateViewerDesktopChatWallpaperFrame();
  if (!wallpaper?.image) {
    layer.style.backgroundImage = '';
    layer.style.backgroundSize = '';
    layer.style.backgroundPosition = '';
    layer.style.removeProperty('--chat-wallpaper-image');
    layer.style.removeProperty('--chat-wallpaper-position');
    return;
  }
  layer.style.backgroundImage = 'url(' + wallpaper.image + ')';
  layer.style.backgroundSize = (wallpaper.size || 100) === 100 ? 'cover' : (wallpaper.size || 100) + '%';
  layer.style.backgroundPosition = (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%';
  layer.style.setProperty('--chat-wallpaper-image', 'url("' + String(wallpaper.image).replace(/"/g, '\\"') + '")');
  layer.style.setProperty('--chat-wallpaper-position', (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%');
}

function viewerWallpaperLayers() {
  return [document.getElementById('viewerWallpaperA'), document.getElementById('viewerWallpaperB')].filter(Boolean);
}

function isDesktopViewerChatWallpaperMode() {
  return viewerDisplayMode !== 'script'
    && window.matchMedia?.('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches;
}

function updateViewerDesktopChatWallpaperFrame() {
  const layers = viewerWallpaperLayers();
  const app = document.getElementById('viewerApp');
  const timeline = document.getElementById('viewerTimeline');
  if (!layers.length) return;
  if (!isDesktopViewerChatWallpaperMode() || !app || !timeline) {
    layers.forEach(layer => {
      layer.style.removeProperty('--chat-wallpaper-frame-top');
      layer.style.removeProperty('--chat-wallpaper-frame-bottom');
    });
    return;
  }
  const appRect = app.getBoundingClientRect();
  const timelineRect = timeline.getBoundingClientRect();
  const top = Math.max(0, Math.round(timelineRect.top - appRect.top));
  const bottom = Math.max(0, Math.round(appRect.bottom - timelineRect.bottom));
  layers.forEach(layer => {
    layer.style.setProperty('--chat-wallpaper-frame-top', top + 'px');
    layer.style.setProperty('--chat-wallpaper-frame-bottom', bottom + 'px');
  });
}

function setWallpaper(wallpaper, key, force = false) {
  updateViewerDesktopChatWallpaperFrame();
  if (!force && key === currentWallpaperKey) return;
  const layers = viewerWallpaperLayers();
  if (!layers.length) return;
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
  if (viewerDisplayMode === 'script') {
    setWallpaper(viewerProject.wallpaper || null, 'script-fixed:' + wallpaperIdentity(viewerProject.wallpaper), force);
    return;
  }
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
    if (text) text.textContent = '\u5171\u6709URL\u306eID\u3092\u8aad\u307f\u53d6\u308c\u307e\u305b\u3093\u3067\u3057\u305f\u3002LINE\u3084Discord\u3067\u958b\u3051\u306a\u3044\u5834\u5408\u306f\u3001\u5916\u90e8\u30d6\u30e9\u30a6\u30b6\u3067\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002';
  } else if (viewerLoadErrorType === 'missing-firebase-config') {
    if (title) title.textContent = 'Firebase\u8a2d\u5b9a\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f';
    if (text) text.textContent = 'Viewer\u304cFirebase\u306b\u63a5\u7d9a\u3067\u304d\u308b\u8a2d\u5b9a\u3092\u8aad\u307f\u8fbc\u3081\u3066\u3044\u307e\u305b\u3093\u3002\u30da\u30fc\u30b8\u3092\u518d\u8aad\u307f\u8fbc\u307f\u3057\u3066\u3082\u6539\u5584\u3057\u306a\u3044\u5834\u5408\u306f\u4f5c\u6210\u8005\u306b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
  } else if (viewerLoadErrorType === 'firebase-connect-failed') {
    if (title) title.textContent = 'Firebase\u306b\u63a5\u7d9a\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f';
    if (text) text.textContent = '\u901a\u4fe1\u74b0\u5883\u3084\u30d6\u30e9\u30a6\u30b6\u5236\u9650\u306b\u3088\u308a\u5171\u6709\u30c7\u30fc\u30bf\u3092\u53d6\u5f97\u3067\u304d\u307e\u305b\u3093\u3002LINE\u5185\u30d6\u30e9\u30a6\u30b6\u306e\u5834\u5408\u306f\u5916\u90e8\u30d6\u30e9\u30a6\u30b6\u3067\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002';
  } else if (viewerLoadErrorType === 'share-not-found') {
    if (title) title.textContent = '\u5171\u6709\u30c7\u30fc\u30bf\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093';
    if (text) text.textContent = '\u3053\u306e\u5171\u6709URL\u306e\u30c7\u30fc\u30bf\u304cFirestore\u306b\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002URL\u304c\u6b63\u3057\u3044\u304b\u3001\u4f5c\u6210\u8005\u304c\u5171\u6709\u30c7\u30fc\u30bf\u3092\u66f4\u65b0\u6e08\u307f\u304b\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
  }
  empty.classList.remove('hidden');
}

function printViewerPdf() {
  if (!viewerProject) return;
  const pdfButton = document.getElementById('viewerPdfButton');
  if (pdfButton) {
    pdfButton.disabled = true;
    pdfButton.textContent = 'PDF準備中';
  }
  const countDetails = document.getElementById('viewerCountDetails');
  const wasOpen = !!countDetails?.open;
  if (countDetails) countDetails.open = true;
  preparePrintPages();

  const restorePrintState = () => {
    if (countDetails) countDetails.open = wasOpen;
    if (pdfButton) {
      pdfButton.disabled = false;
      pdfButton.textContent = 'PDFで保存';
    }
    window.removeEventListener('afterprint', restorePrintState);
  };

  window.addEventListener('afterprint', restorePrintState);
  try {
    const opened = openPrintableWindow();
    if (!opened) return;
  } catch (error) {
    console.error('Viewer print failed', error);
    printAssetsReadyPromise.finally(() => openPrintableWindow());
  } finally {
    setTimeout(() => {
      if (pdfButton && document.contains(pdfButton)) {
        pdfButton.disabled = false;
        pdfButton.textContent = 'PDFで保存';
      }
    }, 1200);
  }
}

window.addEventListener('load', async () => {
  const pdfButton = document.getElementById('viewerPdfButton');
  pdfButton.addEventListener('click', printViewerPdf);
  pdfButton.addEventListener('touchend', event => {
    event.preventDefault();
    printViewerPdf();
  }, { passive: false });
  document.querySelectorAll('input[name="viewerDisplayMode"]').forEach(input => {
    input.addEventListener('change', event => setViewerDisplayMode(event.target.value));
  });
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
  window.addEventListener('resize', () => {
    updateViewerDesktopChatWallpaperFrame();
    applyWallpaper(true);
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      updateViewerDesktopChatWallpaperFrame();
      applyWallpaper(true);
    }, 120);
  });
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
