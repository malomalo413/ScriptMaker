const VIEWER_SCENE_NAME = '\u60c5\u666f\u63cf\u5199';
let viewerProject = null;
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

function loadSharedProject() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const data = hash.get('data');
  if (data) {
    const payload = decodePayload(data);
    return payload?.project || payload;
  }
  const params = new URLSearchParams(location.search);
  const shareId = params.get('share');
  if (shareId) {
    try {
      const shares = JSON.parse(localStorage.getItem('scriptmaker_shares_v1') || '{}');
      return shares[shareId]?.project || null;
    } catch (error) {
      console.error('Viewer share load failed', error);
    }
  }
  return null;
}

function isProtagonist(project, name) {
  return !!project.characters?.find(character => character.name === name)?.isProtagonist;
}

function formatNo(index) {
  return String(index + 1).padStart(3, '0');
}

function avatarHtml(project, talk) {
  if (talk.charName === VIEWER_SCENE_NAME) return '';
  const character = project.characters?.find(item => item.name === talk.charName);
  if (character?.avatar) {
    const radius = character.isRound !== false ? '50%' : '8px';
    return '<div class="viewer-avatar" style="border-radius:' + radius + ';background-image:url(' + character.avatar + ');background-size:' + (character.zoom || 100) + '%;background-position:' + (character.offsetX ?? 50) + '% ' + (character.offsetY ?? 50) + '%"></div>';
  }
  return '<div class="viewer-avatar-dummy">' + escapeHtml((talk.charName || '').slice(0, 2)) + '</div>';
}

function renderViewer(project) {
  viewerProject = JSON.parse(JSON.stringify(project));
  document.getElementById('viewerTitle').innerText = viewerProject.title || '\u53f0\u672c';
  const timeline = document.getElementById('viewerTimeline');
  timeline.innerHTML = '';

  (viewerProject.talks || []).forEach((talk, index) => {
    const isScene = talk.charName === VIEWER_SCENE_NAME;
    const isRight = !isScene && isProtagonist(viewerProject, talk.charName);
    const row = document.createElement('article');
    row.className = 'viewer-talk ' + (isScene ? 'scene' : isRight ? 'right' : 'left');
    row.dataset.talkId = talk.id || String(index);
    row.innerHTML = '<span class="viewer-number">' + formatNo(index) + '</span>' + avatarHtml(viewerProject, talk) + '<div class="viewer-bubble"><span class="viewer-name">' + escapeHtml(talk.charName || '') + '</span>' + escapeHtml(talk.text || '') + '</div>';
    timeline.appendChild(row);
  });

  applyWallpaper(true);
  timeline.addEventListener('scroll', scheduleWallpaper, { passive: true });
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

window.addEventListener('load', () => {
  const project = loadSharedProject();
  if (!project) {
    document.getElementById('viewerEmpty').classList.remove('hidden');
    return;
  }
  renderViewer(project);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
});
