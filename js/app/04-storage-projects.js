// ScriptMaker Editor — 画像保存・保存処理・元に戻す・プロジェクト一覧
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    function openImageDb() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error('IndexedDB is not available'));
          return;
        }
        const request = indexedDB.open(SCRIPTMAKER_IMAGE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SCRIPTMAKER_IMAGE_STORE_NAME)) {
            db.createObjectStore(SCRIPTMAKER_IMAGE_STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open image database'));
      });
    }

    function imageDbRequest(mode, handler) {
      return openImageDb().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(SCRIPTMAKER_IMAGE_STORE_NAME, mode);
        const store = tx.objectStore(SCRIPTMAKER_IMAGE_STORE_NAME);
        let request;
        try {
          request = handler(store);
        } catch (error) {
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error || request?.error || new Error('Image database request failed'));
        tx.onabort = () => reject(tx.error || new Error('Image database request aborted'));
      }));
    }

    function putStoredImage(record) {
      return imageDbRequest('readwrite', store => store.put(record));
    }

    function getStoredImage(id) {
      if (!id) return Promise.resolve(null);
      return imageDbRequest('readonly', store => store.get(id)).catch(error => {
        console.warn('Stored image not found:', id, error);
        return null;
      });
    }

    function createImageId() {
      const bytes = new Uint8Array(12);
      if (window.crypto?.getRandomValues) crypto.getRandomValues(bytes);
      else bytes.forEach((_, index) => bytes[index] = Math.floor(Math.random() * 256));
      return 'img_' + Date.now().toString(36) + '_' + Array.from(bytes).map(byte => byte.toString(36).padStart(2, '0')).join('');
    }

    function dataUrlToBlob(dataUrl) {
      const parts = String(dataUrl || '').split(',');
      if (parts.length < 2) return new Blob([]);
      const header = parts[0] || '';
      const mime = (header.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
      const binary = atob(parts.slice(1).join(','));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
    }

    function loadImageElement(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load image'));
        image.src = src;
      });
    }

    async function resizeImageFileToWebP(file) {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImageElement(dataUrl);
      const width = image.naturalWidth || image.width || 1;
      const height = image.naturalHeight || image.height || 1;
      const scale = Math.min(1, SCRIPTMAKER_WALLPAPER_MAX_SIDE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob || dataUrlToBlob(dataUrl)), 'image/webp', SCRIPTMAKER_WALLPAPER_WEBP_QUALITY);
      });
    }

    const wallpaperObjectUrlCache = new Map();
    function storedBlobToObjectUrl(id, blob) {
      if (wallpaperObjectUrlCache.has(id)) return wallpaperObjectUrlCache.get(id);
      const url = URL.createObjectURL(blob);
      wallpaperObjectUrlCache.set(id, url);
      return url;
    }

    async function storeWallpaperBlob(blob, sourceName = '') {
      const id = createImageId();
      const record = {
        id,
        blob,
        type: blob.type || 'image/webp',
        sourceName,
        createdAt: new Date().toISOString()
      };
      await putStoredImage(record);
      return { id, url: storedBlobToObjectUrl(id, blob) };
    }

    async function storeWallpaperFile(file) {
      const blob = await resizeImageFileToWebP(file);
      return storeWallpaperBlob(blob, file?.name || 'wallpaper');
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => reject(reader.error || new Error('Failed to convert image for sharing'));
        reader.readAsDataURL(blob);
      });
    }

    function wallpaperHasImage(wallpaper) {
      return !!(wallpaper && (wallpaper.imageId || wallpaper.image || wallpaper.imageUrl));
    }

    async function resolveWallpaperUrl(wallpaper) {
      if (!wallpaper) return '';
      if (wallpaper.imageUrl) return wallpaper.imageUrl;
      if (wallpaper.image) return wallpaper.image;
      if (!wallpaper.imageId) return '';
      const record = await getStoredImage(wallpaper.imageId);
      if (!record?.blob) return '';
      return storedBlobToObjectUrl(wallpaper.imageId, record.blob);
    }

    async function resolveWallpaperDataUrlForShare(wallpaper) {
      if (!wallpaper) return '';
      if (String(wallpaper.image || '').startsWith('data:')) return wallpaper.image;
      if (wallpaper.image && !String(wallpaper.image).startsWith('blob:')) return wallpaper.image;
      if (wallpaper.imageId) {
        const record = await getStoredImage(wallpaper.imageId);
        if (record?.blob) return blobToDataUrl(record.blob);
      }
      if (String(wallpaper.imageUrl || '').startsWith('blob:')) {
        try {
          const response = await fetch(wallpaper.imageUrl);
          const blob = await response.blob();
          return blobToDataUrl(blob);
        } catch (error) {
          console.warn('Failed to read object URL wallpaper for share:', error);
        }
      }
      return '';
    }

    async function hydrateWallpaperForShare(wallpaper) {
      if (!wallpaper || typeof wallpaper !== 'object') return;
      const image = await resolveWallpaperDataUrlForShare(wallpaper);
      wallpaper.image = image || '';
      delete wallpaper.imageId;
      delete wallpaper.imageUrl;
    }

    async function hydrateProjectWallpapersForShare(project) {
      if (!project) return;
      await hydrateWallpaperForShare(project.wallpaper);
      const scenes = project.sceneWallpaperSettings?.scenes || [];
      for (const scene of scenes) await hydrateWallpaperForShare(scene);
    }

    async function migrateWallpaperObjectToIndexedDB(wallpaper) {
      if (!wallpaper || wallpaper.imageId || !String(wallpaper.image || '').startsWith('data:')) return false;
      const blob = dataUrlToBlob(wallpaper.image);
      if (!blob.size) return false;
      const stored = await storeWallpaperBlob(blob, 'migrated-wallpaper');
      wallpaper.imageId = stored.id;
      wallpaper.image = '';
      wallpaper.imageUrl = stored.url;
      return true;
    }

    async function migrateBase64WallpapersToIndexedDB() {
      let changed = false;
      const projects = Object.values(state.projects || {});
      for (const project of projects) {
        changed = (await migrateWallpaperObjectToIndexedDB(project.wallpaper)) || changed;
        const settings = getSceneWallpaperSettings(project);
        for (const scene of settings.scenes || []) {
          changed = (await migrateWallpaperObjectToIndexedDB(scene)) || changed;
        }
      }
      return changed;
    }

    function cloneStateForLocalStorage() {
      const copy = JSON.parse(JSON.stringify(state));
      Object.values(copy.projects || {}).forEach(project => {
        if (project.wallpaper) sanitizeWallpaperForLocalStorage(project.wallpaper);
        (project.sceneWallpaperSettings?.scenes || []).forEach(scene => sanitizeWallpaperForLocalStorage(scene));
      });
      return copy;
    }

    function sanitizeWallpaperForLocalStorage(wallpaper) {
      if (!wallpaper || typeof wallpaper !== 'object') return;
      delete wallpaper.imageUrl;
      if (wallpaper.imageId && String(wallpaper.image || '').startsWith('blob:')) wallpaper.image = '';
      if (wallpaper.imageId && String(wallpaper.image || '').startsWith('data:')) wallpaper.image = '';
    }

    function normalizeSceneWallpaperSettings(project) {
      if (!project) return { enabled: false, scenes: [] };
      ensureTalkIds(project);
      const current = project.sceneWallpaperSettings || {};
      const scenes = Array.isArray(current.scenes) ? current.scenes : [];
      project.sceneWallpaperSettings = {
        enabled: !!current.enabled,
        scenes: scenes.map((scene, index) => normalizeSceneWallpaper(scene, index, project)).filter(Boolean)
      };
      enforceUniqueSceneTalkSelections(project.sceneWallpaperSettings.scenes);
      return project.sceneWallpaperSettings;
    }

    function normalizeSceneWallpaper(scene, index, project) {
      if (!scene || typeof scene !== 'object') return null;
      let talkIds = Array.isArray(scene.talkIds) ? scene.talkIds.filter(Boolean).map(String) : [];
      if (talkIds.length === 0 && project && Array.isArray(project.talks) && (scene.start || scene.end)) {
        const start = Math.max(1, parseInt(scene.start, 10) || 1);
        const endValue = parseInt(scene.end, 10);
        const end = Math.max(start, endValue || start);
        talkIds = project.talks.slice(start - 1, end).map(talk => talk.id).filter(Boolean);
      }
      return {
        id: scene.id || ('scene_' + Date.now() + '_' + index + '_' + Math.floor(Math.random() * 1000)),
        name: String(scene.name || 'シーン' + (index + 1)),
        talkIds,
        imageId: scene.imageId || "",
        image: scene.image || "",
        order: Number.isFinite(Number(scene.order)) ? Number(scene.order) : index,
        size: Math.max(100, parseInt(scene.size, 10) || 100),
        offsetX: Number.isFinite(Number(scene.offsetX)) ? Number(scene.offsetX) : 50,
        offsetY: Number.isFinite(Number(scene.offsetY)) ? Number(scene.offsetY) : 50
      };
    }

    function enforceUniqueSceneTalkSelections(scenes) {
      const ownerByTalkId = new Map();
      scenes.forEach(scene => (scene.talkIds || []).forEach(talkId => ownerByTalkId.set(talkId, scene.id)));
      scenes.forEach(scene => {
        scene.talkIds = [...new Set(scene.talkIds || [])].filter(talkId => ownerByTalkId.get(talkId) === scene.id);
      });
    }

    function getSceneWallpaperSettings(project) {
      if (!project) return { enabled: false, scenes: [] };
      if (!project.sceneWallpaperSettings) normalizeSceneWallpaperSettings(project);
      return project.sceneWallpaperSettings;
    }


    function cloneProject(project) { return JSON.parse(JSON.stringify(project)); }
    function createProjectHistorySnapshot(project) {
      const snapshot = cloneProject(project);
      snapshot.__selectedCharacter = currentCharacter;
      return snapshot;
    }
    function getCurrentUndoStack() { const id = state.currentProjectId; if (!id) return []; if (!undoStacks[id]) undoStacks[id] = []; return undoStacks[id]; }
    function getCurrentRedoStack() { const id = state.currentProjectId; if (!id) return []; if (!redoStacks[id]) redoStacks[id] = []; return redoStacks[id]; }
    function pushUndoSnapshot() {
      if (isApplyingHistory) return;
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      const stack = getCurrentUndoStack();
      stack.push(createProjectHistorySnapshot(project));
      if (stack.length > MAX_HISTORY) stack.shift();
      redoStacks[state.currentProjectId] = [];
      updateHistoryButtons();
    }
    function restoreProjectSnapshot(snapshot) {
      if (!snapshot || !state.currentProjectId) return;
      const anchor = captureTimelineViewport(editingTalkId || '');
      isApplyingHistory = true;
      state.projects[state.currentProjectId] = cloneProject(snapshot);
      normalizeProjectData();
      const project = state.projects[state.currentProjectId];
      const characterNames = new Set((project.characters || []).map(char => char.name));
      if (snapshot.__selectedCharacter && characterNames.has(snapshot.__selectedCharacter)) {
        currentCharacter = snapshot.__selectedCharacter;
      } else if (!characterNames.has(currentCharacter) && currentCharacter !== '情景描写') {
        currentCharacter = project.characters?.[0]?.name || '情景描写';
      }
      delete project.__selectedCharacter;
      document.getElementById('projectTitle').innerText = project.title;
      document.getElementById('projectTitle').onclick = renameCurrentProject;
      updateHistoryButtons();
      editingTalkIndex = null;
      editingTalkId = null;
      selectedTalkIndexes.clear();
      updateInlineEditState();
      applyProjectWallpaper(true);
      renderCharSelector();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
      saveState();
      isApplyingHistory = false;
      updateHistoryButtons();
    }
    function undoProjectAction() {
      const project = state.projects[state.currentProjectId];
      const undo = getCurrentUndoStack();
      if (!project || undo.length === 0) return;
      getCurrentRedoStack().push(createProjectHistorySnapshot(project));
      restoreProjectSnapshot(undo.pop());
    }
    function redoProjectAction() {
      const project = state.projects[state.currentProjectId];
      const redo = getCurrentRedoStack();
      if (!project || redo.length === 0) return;
      getCurrentUndoStack().push(createProjectHistorySnapshot(project));
      restoreProjectSnapshot(redo.pop());
    }
    function updateHistoryButtons() {
      const undoBtn = document.getElementById('undoBtn');
      const redoBtn = document.getElementById('redoBtn');
      if (undoBtn) undoBtn.disabled = getCurrentUndoStack().length === 0;
      if (redoBtn) redoBtn.disabled = getCurrentRedoStack().length === 0;
    }
    function renameCurrentProject() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      const name = prompt('プロジェクト名', project.title || '');
      if (!name || name.trim() === project.title) return;
      pushUndoSnapshot();
      project.title = name.trim();
      document.getElementById('projectTitle').innerText = project.title;
      saveState();
      updateHistoryButtons();
    }
    function createFolder() {
      const name = prompt('フォルダ名');
      if (!name || !name.trim()) return;
      const id = 'folder_' + Date.now();
      state.folders[id] = { id, name: name.trim() };
      state.currentFolderId = id;
      saveState();
      renderProjectList();
    }
    function selectFolder(id) { if (!state.folders[id]) return; state.currentFolderId = id; saveState(); renderProjectList(); }
    function renameFolder(event, id) {
      event.stopPropagation();
      if (id === UNCLASSIFIED_FOLDER_ID) return;
      const folder = state.folders[id];
      const name = prompt('フォルダ名', folder.name);
      if (!name || !name.trim()) return;
      folder.name = name.trim();
      saveState();
      renderProjectList();
    }
    function deleteFolder(event, id) {
      event.stopPropagation();
      if (id === UNCLASSIFIED_FOLDER_ID) return;
      if (!confirm('このフォルダを削除しますか？\nプロジェクトは未分類に移動します。')) return;
      Object.values(state.projects).forEach(project => { if (project.folderId === id) project.folderId = UNCLASSIFIED_FOLDER_ID; });
      delete state.folders[id];
      if (state.currentFolderId === id) state.currentFolderId = UNCLASSIFIED_FOLDER_ID;
      saveState();
      renderProjectList();
    }
    function moveProjectToFolder(event, projectId) {
      event.stopPropagation();
      const project = state.projects[projectId];
      if (!project) return;
      project.folderId = event.target.value || UNCLASSIFIED_FOLDER_ID;
      saveState();
      renderProjectList();
    }

    function saveState() {
      try {
        setSaveStatus('saving');
        touchEditorSyncMetadata();
        localStorage.setItem('script_assistant_data_v21', JSON.stringify(cloneStateForLocalStorage()));
        scheduleEditorBackupSync();
        markSaveCompleteSoon();
        return true;
      } catch (e) {
        console.error("保存エラー:", e);
        setSaveStatus('error');
        alert("画像データが大きすぎるため保存できませんでした。別の画像を選ぶか、画像サイズを小さくしてください。");
        return false;
      }
    }

    function setSaveStatus(status) {
      const el = document.getElementById('saveStatus');
      if (!el) return;
      if (saveStatusTimer) {
        clearTimeout(saveStatusTimer);
        saveStatusTimer = null;
      }
      el.classList.remove('save-status-saving', 'save-status-saved', 'save-status-error');
      if (status === 'saving') {
        el.textContent = '保存中… ↻';
        el.classList.add('save-status-saving');
      } else if (status === 'error') {
        el.textContent = '保存エラー !';
        el.classList.add('save-status-error');
      } else {
        el.textContent = '保存済み ✓';
        el.classList.add('save-status-saved');
      }
    }

    function markSaveCompleteSoon() {
      if (saveStatusTimer) clearTimeout(saveStatusTimer);
      saveStatusTimer = setTimeout(() => {
        setSaveStatus('saved');
      }, 180);
    }

    function renderProjectList() {
      const list = document.getElementById('projectList');
      const folderList = document.getElementById('folderList');
      list.innerHTML = '';
      if (folderList) {
        folderList.innerHTML = '';
        Object.values(state.folders || {}).forEach(folder => {
          const count = Object.values(state.projects || {}).filter(project => (project.folderId || UNCLASSIFIED_FOLDER_ID) === folder.id).length;
          const item = document.createElement('div');
          item.className = 'folder-chip' + (state.currentFolderId === folder.id ? ' active' : '');
          item.onclick = () => selectFolder(folder.id);
          item.innerHTML = '<span>&#128193; ' + escapeHtml(folder.name) + ' (' + count + ')</span>' + (folder.id === UNCLASSIFIED_FOLDER_ID ? '' : '<button onclick="renameFolder(event, \'' + folder.id + '\')">&#9998;</button><button onclick="deleteFolder(event, \'' + folder.id + '\')">&times;</button>');
          folderList.appendChild(item);
        });
      }
      const folderOptions = Object.values(state.folders || {}).map(folder => '<option value="' + folder.id + '">' + escapeHtml(folder.name) + '</option>').join('');
      Object.keys(state.projects).filter(id => (state.projects[id].folderId || UNCLASSIFIED_FOLDER_ID) === state.currentFolderId).forEach(id => {
        const project = state.projects[id];
        const card = document.createElement('div');
        card.className = 'project-card';
        if (renamingProjectId === id) {
          card.innerHTML = '<div class="project-info project-rename-editor" onclick="event.stopPropagation()"><input id="projectRenameInput_' + id + '" type="text" value="' + escapeHtml(project.title || '') + '" maxlength="80" aria-label="プロジェクト名"><p>キャラクター: ' + project.characters.length + '人 / 台本: ' + project.talks.length + '行</p></div><div class="project-card-actions" onclick="event.stopPropagation()"><button class="project-rename-save-btn" onclick="confirmProjectRename(event, \'' + id + '\')">保存</button><button class="project-rename-cancel-btn" onclick="cancelProjectRename(event)">キャンセル</button></div>';
        } else {
          card.innerHTML = '<div class="project-info" onclick="openProject(\'' + id + '\')"><h3>' + escapeHtml(project.title) + '</h3><p>キャラクター: ' + project.characters.length + '人 / 台本: ' + project.talks.length + '行</p></div><div class="project-card-actions" onclick="event.stopPropagation()"><select onchange="moveProjectToFolder(event, \'' + id + '\')">' + folderOptions + '</select><button class="project-rename-btn" onclick="beginProjectRename(event, \'' + id + '\')" title="名前を変更">&#9998; 名前</button><button class="duplicate-project-btn" onclick="duplicateProject(event, \'' + id + '\')">複製</button><button class="delete-project-btn" onclick="deleteProject(event, \'' + id + '\')">削除</button></div>';
        }
        const select = card.querySelector('select');
        if (select) select.value = project.folderId || UNCLASSIFIED_FOLDER_ID;
        list.appendChild(card);
        if (renamingProjectId === id) {
          const input = card.querySelector('input');
          if (input) {
            input.focus();
            input.select();
            input.addEventListener('keydown', event => {
              if (event.key === 'Enter') confirmProjectRename(event, id);
              if (event.key === 'Escape') cancelProjectRename(event);
            });
          }
        }
      });
      if (!list.children.length) {
        const empty = document.createElement('div');
        empty.className = 'project-empty';
        empty.innerText = 'このフォルダにはプロジェクトがありません。';
        list.appendChild(empty);
      }
    }

    function beginProjectRename(event, id) {
      event.stopPropagation();
      if (!state.projects[id]) return;
      renamingProjectId = id;
      renderProjectList();
    }

    function confirmProjectRename(event, id) {
      event.stopPropagation();
      const project = state.projects[id];
      const input = document.getElementById('projectRenameInput_' + id);
      if (!project || !input) return;
      const nextTitle = input.value.trim();
      if (!nextTitle) return;
      if (nextTitle !== project.title) {
        project.title = nextTitle;
        saveState();
      }
      renamingProjectId = null;
      renderProjectList();
    }

    function cancelProjectRename(event) {
      event.stopPropagation();
      renamingProjectId = null;
      renderProjectList();
    }

    function openModal(id) {
      document.getElementById(id).classList.remove('hidden');
      document.body.classList.add('modal-open');
    }
    function closeModal(id) {
      document.getElementById(id).classList.add('hidden');
      if (!document.querySelector('.custom-modal:not(.hidden)')) document.body.classList.remove('modal-open');
      if (id === 'stageDirectionModal' && stageDirectionViewportAnchor) {
        restoreTimelineViewport(stageDirectionViewportAnchor);
        stageDirectionViewportAnchor = null;
      }
    }

    function initCharacterModalActions() {
      const confirmBtn = document.getElementById('charConfirmBtn');
      if (!confirmBtn) return;

      const runConfirm = function(e) {
        e.preventDefault();
        e.stopPropagation();
        confirmSaveCharacter();
      };

      confirmBtn.addEventListener('click', runConfirm);
    }

    function initWallpaperModalActions() {
      const confirmBtn = document.getElementById('wallpaperConfirmBtn');
      if (!confirmBtn) return;

      const runConfirm = function(e) {
        e.preventDefault();
        e.stopPropagation();
        confirmWallpaper();
      };

      confirmBtn.addEventListener('pointerup', runConfirm);
      confirmBtn.addEventListener('touchend', runConfirm);
      confirmBtn.addEventListener('click', runConfirm);
    }

    function openCreateProjectModal() {
      document.getElementById('newProjectName').value = '';
      openModal('projectModal');
    }

    function confirmCreateProject() {
      const name = document.getElementById('newProjectName').value.trim();
      if (!name) return;
      const id = "p_" + Date.now();
      const now = new Date().toISOString();
      const device = getEditorBackupDevice();
      state.projects[id] = {
        id,
        title: name,
        characters: [],
        talks: [],
        folderId: state.currentFolderId || UNCLASSIFIED_FOLDER_ID,
        revision: 1,
        updatedAt: now,
        updatedByDeviceId: device.id
      };
      syncCharacterLibraryFromProjects();
      saveState();
      renderProjectList();
      closeModal('projectModal');
      openProject(id);
    }

    function deleteProject(event, id) {
      event.stopPropagation();
      if (confirm("このプロジェクトを削除しますか？")) {
        recordProjectDeletion(id, state.projects[id]);
        delete state.projects[id];
        if (state.currentProjectId === id) state.currentProjectId = Object.keys(state.projects || {})[0] || null;
        saveState();
        renderProjectList();
      }
    }


    function duplicateProject(event, id) {
      event.stopPropagation();
      const source = state.projects[id];
      if (!source) return;
      const newId = 'p_' + Date.now();
      const copy = cloneProject(source);
      const now = new Date().toISOString();
      const device = getEditorBackupDevice();
      copy.id = newId;
      copy.title = (source.title || 'プロジェクト') + ' のコピー';
      copy.folderId = source.folderId || UNCLASSIFIED_FOLDER_ID;
      copy.revision = 1;
      copy.updatedAt = now;
      copy.updatedByDeviceId = device.id;
      if (Array.isArray(copy.talks)) {
        const idMap = new Map();
        copy.talks.forEach(talk => {
          const oldId = talk.id;
          talk.id = createTalkId();
          if (oldId) idMap.set(oldId, talk.id);
        });
        if (copy.sceneWallpaperSettings?.scenes) {
          copy.sceneWallpaperSettings.scenes.forEach(scene => {
            scene.id = 'scene_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
            scene.talkIds = (scene.talkIds || []).map(talkId => idMap.get(talkId)).filter(Boolean);
          });
        }
      }
      state.projects[newId] = copy;
      saveState();
      renderProjectList();
    }
