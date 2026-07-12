const EDITOR_AUTH_HASH_KEY = 'scriptmaker_editor_password_hash_v1';
const EDITOR_AUTH_SESSION_KEY = 'scriptmaker_editor_auth_ok_v1';
const EDITOR_AUTH_SAVED_HASH_KEY = 'scriptmaker_editor_saved_password_hash_v1';
const SCRIPTMAKER_PUBLIC_VIEWER_URL = 'https://small-4c16f.web.app/';
const SCRIPTMAKER_SHARE_WORKER_URL = '';
const SCRIPTMAKER_SHARE_WORKER_URL_KEY = 'scriptmaker_share_worker_url_v1';
const SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY = 'scriptmaker_share_viewer_password_v1';
const SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY = 'scriptmaker_editor_count_settings_v1';
const SCRIPTMAKER_CHARACTER_LIBRARY_KEY = 'scriptmaker_character_library_v1';
const SCRIPTMAKER_EDITOR_CLOUD_URL = 'https://malomalo413.github.io/ScriptMaker/Editor/';
const SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY = 'scriptmaker_editor_cloud_last_project_id_v1';
const SCRIPTMAKER_SCRIPT_COLOR_PREFIX = 'scriptmaker_editor_script_colors_v1:';

let state = {
      currentProjectId: null,
      projects: {},
      apiKey: "",
      aiToggle: true
    };

    let currentCharacter = 'らん';
    let isEditMode = false;
    let editingCharName = null;
    let charModalMode = 'project-add';
    let editingLibraryCharacterSignature = null;
    let selectedAvatarBase64 = "";
    let avatarOffsetX = 50;
    let avatarOffsetY = 50;
    let editingTalkIndex = null;
    let editingTalkId = null;
    let selectedTalkIndexes = new Set();
    let predictedTalks = []; 
    let selectedWallpaperBase64 = "";
    let wallpaperSize = 100;
    let wallpaperOffsetX = 50;
    let wallpaperOffsetY = 50;
    let wallpaperPanStart = null;
    let wallpaperPanOffset = null;
    let predictionRequestId = 0;
    let isSortingTalks = false;
    let pendingTimelineRender = false;
    let suppressTalkClickUntil = 0;
    let aiStatusMessage = "";
    let aiStatusType = "info";
    let editingSceneWallpapers = [];
    let currentWallpaperKey = "";
    let activeWallpaperLayerIndex = 0;
    let sceneWallpaperRaf = 0;
    const UNCLASSIFIED_FOLDER_ID = 'folder_uncategorized';
    const MAX_HISTORY = 20;
    let undoStacks = {};
    let redoStacks = {};
    let isApplyingHistory = false;
    let pendingSharePayload = null;
    let pendingSharePublished = false;
    let editorDisplayMode = 'chat';
    let editorRequestedFullscreenForOrientation = false;
    let cloudSyncUrlHandled = false;
    let editorScriptColorSettings = {};

    let originalViewportHeight = window.innerHeight;
    const GEMINI_MODEL_CANDIDATES = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash'
    ];


    async function hashPasswordText(value) {
      const input = String(value || '');
      if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return 'sha256:' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      }
      return 'fallback:' + btoa(unescape(encodeURIComponent(input)));
    }

    function editorPasswordHash() {
      return localStorage.getItem(EDITOR_AUTH_HASH_KEY) || '';
    }

    function savedEditorPasswordHash() {
      return localStorage.getItem(EDITOR_AUTH_SAVED_HASH_KEY) || '';
    }

    function unlockEditorAuth(hash) {
      if (hash) sessionStorage.setItem(EDITOR_AUTH_SESSION_KEY, hash);
      document.body.classList.remove('auth-locked');
      document.getElementById('editorAuthGate')?.classList.add('hidden');
      setTimeout(initCloudSyncFromUrl, 80);
    }

    function showEditorAuthGate() {
      const storedHash = editorPasswordHash();
      const gate = document.getElementById('editorAuthGate');
      const title = document.getElementById('editorAuthTitle');
      const help = document.getElementById('editorAuthHelp');
      const confirm = document.getElementById('editorAuthConfirm');
      const password = document.getElementById('editorAuthPassword');
      const remember = document.getElementById('editorAuthRemember');
      const message = document.getElementById('editorAuthMessage');
      if (!gate || !title || !help || !confirm || !password || !message) return;
      document.body.classList.add('auth-locked');
      gate.classList.remove('hidden');
      message.textContent = '';
      password.value = '';
      confirm.value = '';
      if (remember) remember.checked = true;
      if (storedHash) {
        title.textContent = '\u30d1\u30b9\u30ef\u30fc\u30c9\u5165\u529b';
        help.textContent = '\u8a2d\u5b9a\u6e08\u307f\u306e\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5165\u529b\u3059\u308b\u3068Editor\u3092\u958b\u304d\u307e\u3059\u3002';
        confirm.classList.add('hidden');
        confirm.style.display = 'none';
        confirm.hidden = true;
      } else {
        title.textContent = '\u521d\u56de\u30d1\u30b9\u30ef\u30fc\u30c9\u8a2d\u5b9a';
        help.textContent = '\u3053\u306e\u7aef\u672b\u3067Editor\u3092\u958b\u304f\u305f\u3081\u306e\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u8a2d\u5b9a\u3057\u307e\u3059\u3002';
        confirm.classList.remove('hidden');
        confirm.style.display = '';
        confirm.hidden = false;
      }
      setTimeout(() => password.focus(), 80);
    }

    function initEditorAuthGate() {
      const storedHash = editorPasswordHash();
      if (storedHash && sessionStorage.getItem(EDITOR_AUTH_SESSION_KEY) === storedHash) {
        unlockEditorAuth(storedHash);
        return;
      }
      const savedHash = savedEditorPasswordHash();
      if (storedHash && savedHash === storedHash) {
        unlockEditorAuth(storedHash);
        return;
      }
      if (savedHash && savedHash !== storedHash) {
        localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
      }
      showEditorAuthGate();
    }

    async function submitEditorPassword() {
      const storedHash = editorPasswordHash();
      const password = document.getElementById('editorAuthPassword')?.value || '';
      const confirm = document.getElementById('editorAuthConfirm')?.value || '';
      const remember = document.getElementById('editorAuthRemember')?.checked !== false;
      const message = document.getElementById('editorAuthMessage');
      if (!password) {
        if (message) message.textContent = '\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044\u3002';
        return;
      }
      const hash = await hashPasswordText(password);
      if (!storedHash) {
        if (password !== confirm) {
          if (message) message.textContent = '\u78ba\u8a8d\u7528\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u4e00\u81f4\u3057\u307e\u305b\u3093\u3002';
          return;
        }
        localStorage.setItem(EDITOR_AUTH_HASH_KEY, hash);
        if (remember) localStorage.setItem(EDITOR_AUTH_SAVED_HASH_KEY, hash);
        else localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
        unlockEditorAuth(hash);
        return;
      }
      if (hash !== storedHash) {
        if (message) message.textContent = '\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3044\u307e\u3059\u3002';
        return;
      }
      if (remember) localStorage.setItem(EDITOR_AUTH_SAVED_HASH_KEY, storedHash);
      else localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
      unlockEditorAuth(storedHash);
    }

    function clearSavedEditorPassword() {
      localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
      const remember = document.getElementById('editorAuthRemember');
      const message = document.getElementById('editorAuthMessage');
      if (remember) remember.checked = false;
      if (message) {
        message.textContent = '\u4fdd\u5b58\u3057\u305f\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u524a\u9664\u3057\u307e\u3057\u305f\u3002';
        message.classList.remove('is-error');
      }
    }

    function logoutEditorAuth() {
      sessionStorage.removeItem(EDITOR_AUTH_SESSION_KEY);
      showEditorAuthGate();
    }


    window.onload = function() {
      const saved = localStorage.getItem('script_assistant_data_v21');
      if (saved) {
        state = JSON.parse(saved);
        if (state.apiKey === undefined) state.apiKey = "";
        if (state.aiToggle === undefined) state.aiToggle = true;
      } else {
        state.projects["p_default"] = {
          title: "チャットプロジェクト",
          characters: [
            { name: "らん", avatar: "", isRound: true, zoom: 100, isProtagonist: true },
            { name: "キャラ2", avatar: "", isRound: true, zoom: 100, isProtagonist: false }
          ],
          talks: [
            { charName: "らん", text: "セリフを長押し（0.4秒）すると、画面下の中央にゴミ箱が現れます！" },
            { charName: "キャラ2", text: "そのままゴミ箱までスワイプして指を離すと消去できるよ！" }
          ]
        };
        state.apiKey = "";
        state.aiToggle = true;
        saveState();
      }

      normalizeProjectData();
      syncCharacterLibraryFromProjects();

      document.getElementById('apiKey').value = state.apiKey;
      document.getElementById('aiToggle').checked = state.aiToggle;

      renderProjectList();
      initSortableDragAndTrash();
      initKeyboardAvoidance();   
      initPointerPinchZoom();
      initCountControls();
      initCharacterModalActions();
      initWallpaperModalActions();
      initWallpaperPan();
      initSceneWallpaperScroll();
      initNumberSettingsControls();
      initEditorDisplayModeControls();
      syncEditorOrientationForDisplayMode(false);
      initCloudSyncFromUrl();
    };

    setTimeout(initEditorAuthGate, 0);

    function normalizeProjectData() {
      if (!state.folders || typeof state.folders !== 'object') state.folders = {};
      if (!state.folders[UNCLASSIFIED_FOLDER_ID]) state.folders[UNCLASSIFIED_FOLDER_ID] = { id: UNCLASSIFIED_FOLDER_ID, name: '\u672a\u5206\u985e' };
      if (!state.currentFolderId || !state.folders[state.currentFolderId]) state.currentFolderId = UNCLASSIFIED_FOLDER_ID;
      if (!state.settings || typeof state.settings !== 'object') state.settings = {};
      if (state.settings.showTalkNumbers === undefined) state.settings.showTalkNumbers = true;
      if (state.settings.outputTalkNumbers === undefined) state.settings.outputTalkNumbers = false;

      Object.values(state.projects || {}).forEach(project => {
        if (!Array.isArray(project.characters)) project.characters = [];
        project.characters.forEach((char, index) => {
          if (char.isProtagonist === undefined) char.isProtagonist = index === 0;
        });
        if (!project.characters.some(char => char.isProtagonist) && project.characters[0]) project.characters[0].isProtagonist = true;
        if (!project.folderId || !state.folders[project.folderId]) project.folderId = UNCLASSIFIED_FOLDER_ID;
        ensureTalkIds(project);
        normalizeSceneWallpaperSettings(project);
      });
      syncCharacterLibraryFromProjects();
    }

    function createTalkId() {
      return 'talk_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    function ensureTalkIds(project) {
      if (!project) return;
      if (!Array.isArray(project.talks)) project.talks = [];
      const usedIds = new Set();
      project.talks.forEach(talk => {
        if (!talk.id || usedIds.has(talk.id)) talk.id = createTalkId();
        if (!talk.stageDirection && talk.note) talk.stageDirection = talk.note;
        if (talk.stageDirection != null && typeof talk.stageDirection !== 'string') talk.stageDirection = String(talk.stageDirection);
        usedIds.add(talk.id);
      });
    }

    function createTalkRecord(charName, text, stageDirection = '') {
      const record = { id: createTalkId(), charName, text };
      if (stageDirection && stageDirection.trim()) record.stageDirection = stageDirection.trim();
      return record;
    }

    function characterLibrarySignature(character) {
      return String(character?.name || '').trim() + '\u0000' + String(character?.avatar || '');
    }

    function normalizeLibraryCharacter(character) {
      const name = String(character?.name || '').trim();
      if (!name || name === '\u60c5\u666f\u63cf\u5199' || name === '\u30b7\u30b9\u30c6\u30e0') return null;
      return {
        name,
        avatar: character.avatar || '',
        isRound: character.isRound !== false,
        zoom: Number(character.zoom) || 100,
        offsetX: character.offsetX ?? 50,
        offsetY: character.offsetY ?? 50,
        createdAt: character.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    function loadCharacterLibrary() {
      try {
        const raw = JSON.parse(localStorage.getItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY) || '[]');
        if (!Array.isArray(raw)) return [];
        const merged = [];
        raw.forEach(character => mergeCharacterIntoLibraryList(merged, character));
        return merged;
      } catch (error) {
        console.warn('Character library load failed', error);
        return [];
      }
    }

    function saveCharacterLibrary(list) {
      localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, JSON.stringify(list || []));
    }

    function mergeCharacterIntoLibraryList(list, character) {
      const normalized = normalizeLibraryCharacter(character);
      if (!normalized) return list;
      const signature = characterLibrarySignature(normalized);
      const index = list.findIndex(item => characterLibrarySignature(item) === signature);
      if (index >= 0) {
        list[index] = { ...list[index], ...normalized, createdAt: list[index].createdAt || normalized.createdAt };
      } else {
        list.push(normalized);
      }
      return list;
    }

    function registerCharacterInLibrary(character) {
      const list = loadCharacterLibrary();
      mergeCharacterIntoLibraryList(list, character);
      saveCharacterLibrary(list);
    }

    function syncCharacterLibraryFromProjects() {
      const list = loadCharacterLibrary();
      Object.values(state.projects || {}).forEach(project => {
        (project.characters || []).forEach(character => mergeCharacterIntoLibraryList(list, character));
      });
      saveCharacterLibrary(list);
    }

    function cloneLibraryCharacterForProject(character, isProtagonist) {
      return {
        name: character.name,
        avatar: character.avatar || '',
        isRound: character.isRound !== false,
        zoom: Number(character.zoom) || 100,
        offsetX: character.offsetX ?? 50,
        offsetY: character.offsetY ?? 50,
        isProtagonist: !!isProtagonist
      };
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
        name: String(scene.name || '\u30b7\u30fc\u30f3' + (index + 1)),
        talkIds,
        image: scene.image || "",
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
    function getCurrentUndoStack() { const id = state.currentProjectId; if (!id) return []; if (!undoStacks[id]) undoStacks[id] = []; return undoStacks[id]; }
    function getCurrentRedoStack() { const id = state.currentProjectId; if (!id) return []; if (!redoStacks[id]) redoStacks[id] = []; return redoStacks[id]; }
    function pushUndoSnapshot() {
      if (isApplyingHistory) return;
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      const stack = getCurrentUndoStack();
      stack.push(cloneProject(project));
      if (stack.length > MAX_HISTORY) stack.shift();
      redoStacks[state.currentProjectId] = [];
      updateHistoryButtons();
    }
    function restoreProjectSnapshot(snapshot) {
      if (!snapshot || !state.currentProjectId) return;
      isApplyingHistory = true;
      state.projects[state.currentProjectId] = cloneProject(snapshot);
      normalizeProjectData();
      const project = state.projects[state.currentProjectId];
      document.getElementById('projectTitle').innerText = project.title;
      document.getElementById('projectTitle').onclick = renameCurrentProject;
      updateHistoryButtons();
      predictedTalks = [];
      editingTalkIndex = null;
      editingTalkId = null;
      selectedTalkIndexes.clear();
      updateInlineEditState();
      applyProjectWallpaper(true);
      renderCharSelector();
      renderTimeline();
      updateMetaStats();
      saveState();
      isApplyingHistory = false;
      updateHistoryButtons();
    }
    function undoProjectAction() {
      const project = state.projects[state.currentProjectId];
      const undo = getCurrentUndoStack();
      if (!project || undo.length === 0) return;
      getCurrentRedoStack().push(cloneProject(project));
      restoreProjectSnapshot(undo.pop());
    }
    function redoProjectAction() {
      const project = state.projects[state.currentProjectId];
      const redo = getCurrentRedoStack();
      if (!project || redo.length === 0) return;
      getCurrentUndoStack().push(cloneProject(project));
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
      const name = prompt('\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u540d', project.title || '');
      if (!name || name.trim() === project.title) return;
      pushUndoSnapshot();
      project.title = name.trim();
      document.getElementById('projectTitle').innerText = project.title;
      saveState();
      updateHistoryButtons();
    }
    function createFolder() {
      const name = prompt('\u30d5\u30a9\u30eb\u30c0\u540d');
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
      const name = prompt('\u30d5\u30a9\u30eb\u30c0\u540d', folder.name);
      if (!name || !name.trim()) return;
      folder.name = name.trim();
      saveState();
      renderProjectList();
    }
    function deleteFolder(event, id) {
      event.stopPropagation();
      if (id === UNCLASSIFIED_FOLDER_ID) return;
      if (!confirm('\u3053\u306e\u30d5\u30a9\u30eb\u30c0\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\n\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u306f\u672a\u5206\u985e\u306b\u79fb\u52d5\u3057\u307e\u3059\u3002')) return;
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
        localStorage.setItem('script_assistant_data_v21', JSON.stringify(state));
        return true;
      } catch (e) {
        console.error("保存エラー:", e);
        alert("画像データが大きすぎるため保存できませんでした。別の画像を選ぶか、画像サイズを小さくしてください。");
        return false;
      }
    }

    function saveAiConfig() {
      state.apiKey = document.getElementById('apiKey').value.trim();
      state.aiToggle = document.getElementById('aiToggle').checked;
      predictedTalks = [];
      saveState();
      updateAiStatus();
      closeModal('aiConfigModal');
      alert("AI設定とAPIキーを保存しました。");

      const project = state.projects[state.currentProjectId];
      if (state.aiToggle && state.apiKey && project && project.talks.length > 0) {
        callGeminiApiForPrediction();
      } else {
        renderTimeline();
      }
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
        card.innerHTML = '<div class="project-info" onclick="openProject(\'' + id + '\')"><h3>' + escapeHtml(project.title) + '</h3><p>&#12461;&#12515;&#12521;&#12463;&#12479;&#12540;: ' + project.characters.length + '&#20154; / &#21488;&#26412;: ' + project.talks.length + '&#34892;</p></div><div class="project-card-actions" onclick="event.stopPropagation()"><select onchange="moveProjectToFolder(event, \'' + id + '\')">' + folderOptions + '</select><button class="duplicate-project-btn" onclick="duplicateProject(event, \'' + id + '\')">&#35079;&#35069;</button><button class="delete-project-btn" onclick="deleteProject(event, \'' + id + '\')">&#21066;&#38500;</button></div>';
        const select = card.querySelector('select');
        if (select) select.value = project.folderId || UNCLASSIFIED_FOLDER_ID;
        list.appendChild(card);
      });
      if (!list.children.length) {
        const empty = document.createElement('div');
        empty.className = 'project-empty';
        empty.innerText = '\u3053\u306e\u30d5\u30a9\u30eb\u30c0\u306b\u306f\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u304c\u3042\u308a\u307e\u305b\u3093\u3002';
        list.appendChild(empty);
      }
    }

    function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
    function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

    function initCharacterModalActions() {
      const confirmBtn = document.getElementById('charConfirmBtn');
      if (!confirmBtn) return;

      const runConfirm = function(e) {
        e.preventDefault();
        e.stopPropagation();
        confirmSaveCharacter();
      };

      confirmBtn.addEventListener('pointerup', runConfirm);
      confirmBtn.addEventListener('touchend', runConfirm);
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
      state.projects[id] = {
        title: name,
        characters: [
          { name: "らん", avatar: "", isRound: true, zoom: 100, isProtagonist: true },
          { name: "キャラ2", avatar: "", isRound: true, zoom: 100, isProtagonist: false }
        ],
        talks: [],
        folderId: state.currentFolderId || UNCLASSIFIED_FOLDER_ID
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
        delete state.projects[id];
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
      copy.title = (source.title || '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8') + ' \u306e\u30b3\u30d4\u30fc';
      copy.folderId = source.folderId || UNCLASSIFIED_FOLDER_ID;
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

    function openWallpaperModal() {
      const project = state.projects[state.currentProjectId];
      const wallpaper = project?.wallpaper || {};
      const sceneSettings = getSceneWallpaperSettings(project);

      selectedWallpaperBase64 = wallpaper.image || "";
      wallpaperSize = Math.max(100, wallpaper.size || 100);
      wallpaperOffsetX = wallpaper.offsetX ?? 50;
      wallpaperOffsetY = wallpaper.offsetY ?? 50;
      wallpaperPanStart = null;
      wallpaperPanOffset = null;

      document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundImage = selectedWallpaperBase64 ? 'url(' + selectedWallpaperBase64 + ')' : "";
      editingSceneWallpapers = (sceneSettings.scenes || []).map((scene, index) => normalizeSceneWallpaper(scene, index, project)).filter(Boolean);
      const toggle = document.getElementById('sceneWallpaperToggle');
      if (toggle) toggle.checked = !!sceneSettings.enabled;
      updateWallpaperPreviewStyle();
      renderSceneWallpaperList();
      toggleSceneWallpaperControls();
      openModal('wallpaperModal');
    }

    function previewWallpaper(input) {
      const file = input.files[0];
      if (!file) return;

      compressImageFile(file, 1400, 0.82, function(dataUrl) {
        selectedWallpaperBase64 = dataUrl;
        wallpaperSize = 100;
        wallpaperOffsetX = 50;
        wallpaperOffsetY = 50;
        document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
        document.getElementById('wallpaperPreview').style.backgroundImage = `url(${selectedWallpaperBase64})`;
        updateWallpaperPreviewStyle();
      });
    }

    function updateWallpaperPreviewStyle() {
      wallpaperSize = parseInt(document.getElementById('wallpaperSizeSlider').value);
      document.getElementById('wallpaperSizeVal').innerText = wallpaperSize + "%";

      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundSize = wallpaperSize + "%";
      preview.style.backgroundPosition = `${wallpaperOffsetX}% ${wallpaperOffsetY}%`;
    }

    function confirmWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      pushUndoSnapshot();
      project.wallpaper = selectedWallpaperBase64 ? {
        image: selectedWallpaperBase64,
        size: wallpaperSize,
        offsetX: wallpaperOffsetX,
        offsetY: wallpaperOffsetY
      } : null;
      project.sceneWallpaperSettings = {
        enabled: !!document.getElementById('sceneWallpaperToggle')?.checked,
        scenes: editingSceneWallpapers.map((scene, index) => normalizeSceneWallpaper(scene, index, project)).filter(Boolean)
      };
      enforceUniqueSceneTalkSelections(project.sceneWallpaperSettings.scenes);

      applyProjectWallpaper(true);
      closeModal('wallpaperModal');
      saveState();
    }

    function clearWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      pushUndoSnapshot();
      project.wallpaper = null;
      selectedWallpaperBase64 = "";
      saveState();
      applyProjectWallpaper();
      closeModal('wallpaperModal');
    }

    function applyProjectWallpaper(forceUpdate = false) {
      const project = state.projects[state.currentProjectId];
      if (editorDisplayMode === 'script') {
        setEditorWallpaper(project?.wallpaper || null, 'script-fixed:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
        return;
      }
      const sceneSettings = getSceneWallpaperSettings(project);
      if (sceneSettings.enabled && sceneSettings.scenes.some(scene => scene.image)) {
        updateSceneWallpaperByScroll(forceUpdate);
        return;
      }
      setEditorWallpaper(project?.wallpaper || null, 'single:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
    }

    function getWallpaperIdentity(wallpaper) {
      if (!wallpaper || !wallpaper.image) return 'none';
      return [wallpaper.image.slice(0, 64), wallpaper.size || 100, wallpaper.offsetX ?? 50, wallpaper.offsetY ?? 50].join('|');
    }

    function getWallpaperLayers() {
      return [document.getElementById('editorWallpaperLayer'), document.getElementById('editorWallpaperLayerNext')].filter(Boolean);
    }

    function setEditorWallpaper(wallpaper, key, forceUpdate = false) {
      const layers = getWallpaperLayers();
      if (layers.length === 0) return;
      if (!forceUpdate && key === currentWallpaperKey) return;
      const current = layers[activeWallpaperLayerIndex] || layers[0];
      const nextIndex = layers.length > 1 ? 1 - activeWallpaperLayerIndex : activeWallpaperLayerIndex;
      const next = layers[nextIndex] || current;
      styleWallpaperLayer(next, wallpaper);
      if (layers.length > 1 && next !== current) {
        next.classList.add('active');
        current.classList.remove('active');
        activeWallpaperLayerIndex = nextIndex;
      } else {
        next.classList.add('active');
      }
      currentWallpaperKey = key;
    }

    function styleWallpaperLayer(layer, wallpaper) {
      if (!layer) return;
      if (!wallpaper || !wallpaper.image) {
        layer.style.backgroundImage = "";
        layer.style.backgroundSize = "";
        layer.style.backgroundPosition = "";
        layer.style.transform = "";
        return;
      }
      const size = wallpaper.size || 100;
      layer.style.backgroundImage = 'url(' + wallpaper.image + ')';
      layer.style.backgroundSize = size === 100 ? 'cover' : size + '%';
      layer.style.backgroundPosition = (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%';
      layer.style.transform = "";
    }

    function scheduleSceneWallpaperUpdate() {
      if (sceneWallpaperRaf) return;
      sceneWallpaperRaf = requestAnimationFrame(() => {
        sceneWallpaperRaf = 0;
        updateSceneWallpaperByScroll(false);
      });
    }

    function initSceneWallpaperScroll() {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline) return;
      timeline.addEventListener('scroll', scheduleSceneWallpaperUpdate, { passive: true });
    }

    function updateSceneWallpaperByScroll(forceUpdate = false) {
      const project = state.projects[state.currentProjectId];
      const settings = getSceneWallpaperSettings(project);
      if (!settings.enabled) {
        setEditorWallpaper(project?.wallpaper || null, 'single:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
        return;
      }
      const currentTalkId = getCurrentTimelineTalkId();
      const scenes = settings.scenes.filter(scene => scene.image && Array.isArray(scene.talkIds) && scene.talkIds.length > 0).slice();
      const scene = currentTalkId ? scenes.find(item => item.talkIds.includes(currentTalkId)) || null : null;
      if (!scene) {
        setEditorWallpaper(project?.wallpaper || null, 'scene-fallback:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
        return;
      }
      setEditorWallpaper(scene, 'scene:' + scene.id + ':' + getWallpaperIdentity(scene), forceUpdate);
    }

    function getCurrentTimelineTalkId() {
      const timeline = document.getElementById('talkTimeline');
      const project = state.projects[state.currentProjectId];
      if (!timeline || !project || !Array.isArray(project.talks) || project.talks.length === 0) return null;
      const timelineRect = timeline.getBoundingClientRect();
      const bubbles = Array.from(timeline.querySelectorAll('.chat-bubble:not(.ai-predicted)'));
      if (bubbles.length === 0) return null;
      const anchorY = timelineRect.top + Math.min(90, Math.max(24, timelineRect.height * 0.18));
      let best = bubbles[0];
      let bestDistance = Infinity;
      bubbles.forEach(bubble => {
        const rect = bubble.getBoundingClientRect();
        const center = Math.max(rect.top, Math.min(rect.bottom, anchorY));
        const distance = Math.abs(center - anchorY);
        if (distance < bestDistance) {
          best = bubble;
          bestDistance = distance;
        }
      });
      return best.dataset.talkId || null;
    }


    function toggleSceneWallpaperControls() {
      const toggle = document.getElementById('sceneWallpaperToggle');
      const controls = document.getElementById('sceneWallpaperControls');
      if (!toggle || !controls) return;
      controls.classList.toggle('hidden', !toggle.checked);
    }

    function renderSceneWallpaperList() {
      const list = document.getElementById('sceneWallpaperList');
      const project = state.projects[state.currentProjectId];
      if (!list || !project) return;
      ensureTalkIds(project);
      list.innerHTML = '';
      if (!editingSceneWallpapers.length) {
        const empty = document.createElement('div');
        empty.className = 'scene-wallpaper-empty';
        empty.innerHTML = '&#12471;&#12540;&#12531;&#12434;&#36861;&#21152;&#12377;&#12427;&#12392;&#12289;&#36984;&#25246;&#12375;&#12383;&#12475;&#12522;&#12501;&#12372;&#12392;&#12395;&#22721;&#32025;&#12434;&#20999;&#12426;&#26367;&#12360;&#12425;&#12428;&#12414;&#12377;&#12290;';
        list.appendChild(empty);
        return;
      }
      editingSceneWallpapers.forEach((scene) => {
        const card = document.createElement('div');
        card.className = 'scene-wallpaper-card';
        const fileId = 'sceneWallpaperInput_' + scene.id;
        const charOptions = ['<option value="">&#35441;&#32773;&#12391;&#32094;&#12426;&#36796;&#12415;</option>'].concat(project.characters.map(char => '<option value="' + escapeHtml(char.name) + '">' + escapeHtml(char.name) + '</option>')).join('');
        card.innerHTML =
          '<div class="scene-wallpaper-card-head">' +
            '<input type="text" value="' + escapeHtml(scene.name) + '" placeholder="&#12471;&#12540;&#12531;&#21517;" oninput="updateSceneWallpaperField(\'' + scene.id + '\', \'name\', this.value)">' +
            '<button type="button" class="btn-scene-delete" onclick="deleteSceneWallpaper(\'' + scene.id + '\')">&#21066;&#38500;</button>' +
          '</div>' +
          '<div class="scene-wallpaper-image-row">' +
            '<div class="scene-wallpaper-thumb" style="background-image:' + (scene.image ? 'url(' + scene.image + ')' : 'none') + '"></div>' +
            '<label class="scene-wallpaper-file-btn" for="' + fileId + '">&#22721;&#32025;&#30011;&#20687;&#12434;&#36984;&#25246;</label>' +
            '<input id="' + fileId + '" type="file" accept="image/*" style="display:none" onchange="previewSceneWallpaperImage(this, \'' + scene.id + '\')">' +
          '</div>' +
          '<div class="scene-talk-tools">' +
            '<span id="sceneTalkCount_' + scene.id + '">' + getSceneTalkCountLabel(scene) + '</span>' +
            '<div class="scene-talk-tool-buttons">' +
              '<button type="button" onclick="selectAllSceneTalks(\'' + scene.id + '\')">&#20840;&#36984;&#25246;</button>' +
              '<button type="button" onclick="clearSceneTalks(\'' + scene.id + '\')">&#36984;&#25246;&#35299;&#38500;</button>' +
            '</div>' +
          '</div>' +
          '<div class="scene-talk-filters">' +
            '<input type="search" id="sceneTalkSearch_' + scene.id + '" placeholder="&#26908;&#32034;" oninput="filterSceneTalkOptions(\'' + scene.id + '\')">' +
            '<select id="sceneTalkChar_' + scene.id + '" onchange="filterSceneTalkOptions(\'' + scene.id + '\')">' + charOptions + '</select>' +
          '</div>' +
          '<div class="scene-talk-list" id="sceneTalkList_' + scene.id + '">' + renderSceneTalkOptions(scene, project) + '</div>';
        list.appendChild(card);
      });
    }

    function renderSceneTalkOptions(scene, project) {
      return project.talks.map((talk, index) => {
        const checked = (scene.talkIds || []).includes(talk.id) ? 'checked' : '';
        const owner = getSceneSelectionOwner(talk.id, scene.id);
        const ownedClass = owner ? ' scene-talk-owned' : '';
        const summary = escapeHtml((talk.text || '').replace(/\s+/g, ' ').slice(0, 42));
        const charName = escapeHtml(talk.charName || '');
        const ownerText = owner ? '<small>' + escapeHtml(owner.name) + '&#12391;&#36984;&#25246;&#20013;</small>' : '';
        return '<label class="scene-talk-option' + ownedClass + '" data-talk-id="' + talk.id + '" data-char="' + charName + '" data-search="' + escapeHtml((talk.charName || '') + ' ' + (talk.text || '')) + '">' +
          '<input type="checkbox" ' + checked + ' onchange="toggleSceneTalkSelection(\'' + scene.id + '\', \'' + talk.id + '\', this.checked)">' +
          '<span><strong>' + (index + 1) + '. ' + charName + '</strong><em>' + summary + '</em>' + ownerText + '</span>' +
        '</label>';
      }).join('');
    }

    function getSceneSelectionOwner(talkId, currentSceneId) {
      return editingSceneWallpapers.find(scene => scene.id !== currentSceneId && Array.isArray(scene.talkIds) && scene.talkIds.includes(talkId)) || null;
    }

    function getSceneTalkCountLabel(scene) {
      const count = (scene.talkIds || []).length;
      return '\u9078\u629e\u4e2d: ' + count + '\u4ef6';
    }

    function captureSceneWallpaperScrollState(sceneId, talkId) {
      const modalContent = document.querySelector('#wallpaperModal .modal-content');
      const sceneList = document.getElementById('sceneWallpaperList');
      const talkList = sceneId ? document.getElementById('sceneTalkList_' + sceneId) : null;
      const target = sceneId && talkId ? document.querySelector('#sceneTalkList_' + sceneId + ' .scene-talk-option[data-talk-id="' + talkId + '"]') : null;
      return {
        modalScrollTop: modalContent ? modalContent.scrollTop : 0,
        sceneListScrollTop: sceneList ? sceneList.scrollTop : 0,
        talkListScrollTop: talkList ? talkList.scrollTop : 0,
        sceneId,
        talkId,
        targetTop: target ? target.getBoundingClientRect().top : null
      };
    }

    function restoreSceneWallpaperScrollState(scrollState) {
      if (!scrollState) return;
      const modalContent = document.querySelector('#wallpaperModal .modal-content');
      const sceneList = document.getElementById('sceneWallpaperList');
      const talkList = scrollState.sceneId ? document.getElementById('sceneTalkList_' + scrollState.sceneId) : null;
      if (modalContent) modalContent.scrollTop = scrollState.modalScrollTop || 0;
      if (sceneList) sceneList.scrollTop = scrollState.sceneListScrollTop || 0;
      if (talkList) talkList.scrollTop = scrollState.talkListScrollTop || 0;

      if (scrollState.targetTop === null || !scrollState.sceneId || !scrollState.talkId) return;
      requestAnimationFrame(() => {
        const target = document.querySelector('#sceneTalkList_' + scrollState.sceneId + ' .scene-talk-option[data-talk-id="' + scrollState.talkId + '"]');
        if (!target) return;
        const nextTop = target.getBoundingClientRect().top;
        const delta = nextTop - scrollState.targetTop;
        if (talkList && Math.abs(delta) > 1) talkList.scrollTop += delta;
        else if (modalContent && Math.abs(delta) > 1) modalContent.scrollTop += delta;
      });
    }

    function rerenderSceneWallpaperListKeepingScroll(sceneId, talkId) {
      const scrollState = captureSceneWallpaperScrollState(sceneId, talkId);
      renderSceneWallpaperList();
      restoreSceneWallpaperScrollState(scrollState);
    }

    function updateSceneTalkCountLabels() {
      editingSceneWallpapers.forEach(scene => {
        const countLabel = document.getElementById('sceneTalkCount_' + scene.id);
        if (countLabel) countLabel.textContent = getSceneTalkCountLabel(scene);
      });
    }

    function syncSceneTalkSelectionDom(talkId) {
      const owner = editingSceneWallpapers.find(scene => Array.isArray(scene.talkIds) && scene.talkIds.includes(talkId)) || null;
      document.querySelectorAll('.scene-talk-option').forEach(row => {
        if (row.dataset.talkId !== talkId) return;
        const list = row.closest('.scene-talk-list');
        const sceneId = list ? list.id.replace(/^sceneTalkList_/, '') : '';
        const input = row.querySelector('input[type="checkbox"]');
        const textWrap = row.querySelector('span');
        const oldOwnerLabel = row.querySelector('small');
        const isOwnerScene = !!owner && owner.id === sceneId;
        if (input) input.checked = isOwnerScene;
        row.classList.toggle('scene-talk-owned', !!owner && !isOwnerScene);
        if (oldOwnerLabel) oldOwnerLabel.remove();
        if (owner && !isOwnerScene && textWrap) {
          const ownerLabel = document.createElement('small');
          ownerLabel.textContent = owner.name + '\u3067\u9078\u629e\u4e2d';
          textWrap.appendChild(ownerLabel);
        }
      });
      updateSceneTalkCountLabels();
    }

    function addSceneWallpaper() {
      const nextIndex = editingSceneWallpapers.length + 1;
      editingSceneWallpapers.push({ id: 'scene_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name: '\u30b7\u30fc\u30f3' + nextIndex, talkIds: [], image: '', size: 100, offsetX: 50, offsetY: 50 });
      renderSceneWallpaperList();
      const toggle = document.getElementById('sceneWallpaperToggle');
      if (toggle) toggle.checked = true;
      toggleSceneWallpaperControls();
    }

    function deleteSceneWallpaper(id) {
      editingSceneWallpapers = editingSceneWallpapers.filter(scene => scene.id !== id);
      renderSceneWallpaperList();
    }

    function updateSceneWallpaperField(id, field, value) {
      const scene = editingSceneWallpapers.find(item => item.id === id);
      if (!scene) return;
      scene[field] = value;
    }

    function toggleSceneTalkSelection(sceneId, talkId, checked) {
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!scene) return;
      editingSceneWallpapers.forEach(item => {
        item.talkIds = (item.talkIds || []).filter(id => id !== talkId);
      });
      if (checked) scene.talkIds = [...(scene.talkIds || []), talkId];
      enforceUniqueSceneTalkSelections(editingSceneWallpapers);
      syncSceneTalkSelectionDom(talkId);
    }

    function selectAllSceneTalks(sceneId) {
      const project = state.projects[state.currentProjectId];
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!project || !scene) return;
      const visibleIds = getVisibleSceneTalkIds(sceneId);
      const filtersActive = isSceneTalkFilterActive(sceneId);
      const ids = filtersActive ? visibleIds : project.talks.map(talk => talk.id);
      editingSceneWallpapers.forEach(item => {
        if (item.id !== sceneId) item.talkIds = (item.talkIds || []).filter(id => !ids.includes(id));
      });
      scene.talkIds = [...new Set([...(scene.talkIds || []), ...ids])];
      enforceUniqueSceneTalkSelections(editingSceneWallpapers);
      rerenderSceneWallpaperListKeepingScroll(sceneId);
    }

    function clearSceneTalks(sceneId) {
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!scene) return;
      scene.talkIds = [];
      rerenderSceneWallpaperListKeepingScroll(sceneId);
    }

    function getVisibleSceneTalkIds(sceneId) {
      return Array.from(document.querySelectorAll('#sceneTalkList_' + sceneId + ' .scene-talk-option:not(.filtered-out)')).map(row => row.dataset.talkId).filter(Boolean);
    }

    function isSceneTalkFilterActive(sceneId) {
      const search = (document.getElementById('sceneTalkSearch_' + sceneId)?.value || '').trim();
      const charName = document.getElementById('sceneTalkChar_' + sceneId)?.value || '';
      return !!search || !!charName;
    }

    function filterSceneTalkOptions(sceneId) {
      const search = (document.getElementById('sceneTalkSearch_' + sceneId)?.value || '').trim().toLowerCase();
      const charName = document.getElementById('sceneTalkChar_' + sceneId)?.value || '';
      document.querySelectorAll('#sceneTalkList_' + sceneId + ' .scene-talk-option').forEach(row => {
        const matchesSearch = !search || (row.dataset.search || '').toLowerCase().includes(search);
        const matchesChar = !charName || row.dataset.char === charName;
        row.classList.toggle('filtered-out', !(matchesSearch && matchesChar));
      });
    }

    function previewSceneWallpaperImage(input, id) {
      const file = input.files[0];
      if (!file) return;
      compressImageFile(file, 1400, 0.82, function(dataUrl) {
        const scene = editingSceneWallpapers.find(item => item.id === id);
        if (!scene) return;
        scene.image = dataUrl;
        scene.size = 100;
        scene.offsetX = 50;
        scene.offsetY = 50;
        renderSceneWallpaperList();
      });
    }

    function removeTalkIdsFromSceneSettings(project, talkIds) {
      if (!project || !project.sceneWallpaperSettings || !Array.isArray(talkIds)) return;
      project.sceneWallpaperSettings.scenes.forEach(scene => {
        scene.talkIds = (scene.talkIds || []).filter(id => !talkIds.includes(id));
      });
    }

    function openProject(id) {
      state.currentProjectId = id;
      const project = state.projects[id];
      document.getElementById('openingView').classList.add('hidden');
      document.getElementById('editorView').classList.remove('hidden');
      document.getElementById('projectTitle').innerText = project.title;

      if (project.characters.length > 0) {
        currentCharacter = project.characters[0].name;
      } else {
        currentCharacter = '情景描写';
      }

      predictedTalks = [];
      editingTalkIndex = null;
      editingTalkId = null;
      updateInlineEditState();
      applyProjectWallpaper();
      renderCharSelector();
      renderTimeline();
      updateMetaStats();
      setTimeout(forceResizeViewport, 100);
    }

    function goBack() {
      document.getElementById('editorView').classList.add('hidden');
      document.getElementById('openingView').classList.remove('hidden');
      isEditMode = false;
      selectedTalkIndexes.clear();
      document.body.classList.remove('edit-mode-active');
      document.getElementById('modeToggleBtn').innerText = '編集';
      document.getElementById('modeToggleBtn').classList.remove('editing');
      predictedTalks = [];
      editingTalkIndex = null;
      editingTalkId = null;
      updateInlineEditState();
      renderProjectList();
    }

    function renderCharSelector() {
      const container = document.getElementById('charSelectorContainer');
      container.innerHTML = '';
      const project = state.projects[state.currentProjectId];

      project.characters.forEach(char => {
        const btn = document.createElement('button');
        btn.className = `char-icon-btn ${currentCharacter === char.name ? 'active' : ''}`;
        btn.onpointerdown = function(e) { e.preventDefault(); selectChar(this, char.name); };
        btn.onclick = function() { selectChar(this, char.name); };
        btn.oncontextmenu = function(e) { e.preventDefault(); openCharEditModal(char.name); };

        let avatarHtml = '';
        if (char.avatar) {
          const radius = char.isRound !== false ? '50%' : '8px';
          const zoom = char.zoom || 100;
          const posX = char.offsetX ?? 50;
          const posY = char.offsetY ?? 50;
          avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${char.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
        } else {
          avatarHtml = `<div class="avatar-dummy">${char.name.substring(0,2)}</div>`;
        }

        btn.innerHTML = `${avatarHtml}<span class="char-name-mini">${char.name}</span>`;
        container.appendChild(btn);
      });

      const sceneBtn = document.createElement('button');
      sceneBtn.className = `char-icon-btn ${currentCharacter === '情景描写' ? 'active' : ''}`;
      sceneBtn.onpointerdown = function(e) { e.preventDefault(); selectChar(this, '情景描写'); };
      sceneBtn.onclick = function() { selectChar(this, '情景描写'); };
      sceneBtn.innerHTML = `<div class="effect-icon">💡</div><span class="char-name-mini">情景</span>`;
      container.appendChild(sceneBtn);

      const addBtn = document.createElement('button');
      addBtn.className = 'char-add-btn';
      addBtn.onclick = openCharacterLibraryModal;
      addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
      container.appendChild(addBtn);

      const aiBtn = document.createElement('button');
      aiBtn.className = 'char-ai-btn';
      aiBtn.type = 'button';
      aiBtn.title = 'タップでAI予測を再生成 / 長押しでAPIキー設定';
      aiBtn.innerHTML = '🤖';
      initAiButtonActions(aiBtn);
      container.appendChild(aiBtn);
    }

    function initAiButtonActions(aiBtn) {
      let longPressTimer = null;
      let didLongPress = false;

      const clearTimer = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      aiBtn.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        didLongPress = false;
        clearTimer();
        longPressTimer = setTimeout(() => {
          didLongPress = true;
          openModal('aiConfigModal');
        }, 550);
      });

      aiBtn.addEventListener('pointerup', function(e) {
        e.preventDefault();
        clearTimer();
        if (!didLongPress) refreshAiPredictionsFromButton();
      });

      aiBtn.addEventListener('pointercancel', clearTimer);
      aiBtn.addEventListener('pointerleave', clearTimer);
      aiBtn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
      });
      aiBtn.onclick = function(e) {
        e.preventDefault();
      };
    }

    function refreshAiPredictionsFromButton() {
      const project = state.projects[state.currentProjectId];
      state.aiToggle = true;
      document.getElementById('aiToggle').checked = true;
      predictionRequestId++;
      aiStatusMessage = "AIが予測を更新中...";
      aiStatusType = "info";
      saveState();
      renderTimeline();

      if (!state.apiKey) {
        aiStatusMessage = "";
        renderTimeline();
        openModal('aiConfigModal');
        return;
      }
      if (project && project.talks.length > 0) {
        callGeminiApiForPrediction({ append: false, count: 3 });
      }
    }

    function selectChar(element, name) {
      const input = document.getElementById('inputSpeech');
      const shouldKeepKeyboard = document.body.classList.contains('keyboard-focused') || document.activeElement === input;

      document.querySelectorAll('.char-icon-btn').forEach(b => b.classList.remove('active'));
      element.classList.add('active');
      currentCharacter = name;
      if (editingTalkId !== null) updateInlineEditState();

      if (shouldKeepKeyboard) {
        setTimeout(() => input.focus({ preventScroll: true }), 0);
      }
    }

    function updatePreviewStyle() {
      const isRound = document.getElementById('charRoundCheck').checked;
      const zoom = document.getElementById('charZoomSlider').value;
      document.getElementById('zoomVal').innerText = zoom + "%";
      const preview = document.getElementById('avatarPreview');
      preview.style.borderRadius = isRound ? '50%' : '8px';
      preview.style.backgroundSize = zoom + "%";
      preview.style.backgroundPosition = `${avatarOffsetX}% ${avatarOffsetY}%`;
    }

    function openCharAddModal() {
      resetAvatarGesture();
      charModalMode = 'project-add';
      editingCharName = null;
      editingLibraryCharacterSignature = null;
      selectedAvatarBase64 = "";
      avatarOffsetX = 50;
      avatarOffsetY = 50;
      document.getElementById('charModalTitle').innerText = "キャラクター追加";
      document.getElementById('newCharName').value = "";
      document.getElementById('newCharName').disabled = false;
      document.getElementById('charRoundCheck').checked = true;
      const project = state.projects[state.currentProjectId];
      document.getElementById('charProtagonistCheck').checked = !project.characters.some(c => c.isProtagonist);
      document.getElementById('charZoomSlider').value = 100;
      const preview = document.getElementById('avatarPreview');
      preview.style.backgroundImage = "";
      updatePreviewStyle();
      openModal('charModal');
    }

    function openCharEditModal(name) {
      resetAvatarGesture();
      charModalMode = 'project-edit';
      editingCharName = name;
      editingLibraryCharacterSignature = null;
      const project = state.projects[state.currentProjectId];
      const char = project.characters.find(c => c.name === name);

      document.getElementById('charModalTitle').innerText = `${name} のアバター編集`;
      document.getElementById('newCharName').value = char.name;
      document.getElementById('newCharName').disabled = false;
      
      selectedAvatarBase64 = char.avatar || "";
      document.getElementById('charRoundCheck').checked = char.isRound !== false;
      document.getElementById('charProtagonistCheck').checked = !!char.isProtagonist;
      document.getElementById('charZoomSlider').value = char.zoom || 100;

      const preview = document.getElementById('avatarPreview');
      if (char.avatar) {
        preview.style.backgroundImage = `url(${char.avatar})`;
      } else {
        preview.style.backgroundImage = "";
      }
      avatarOffsetX = char.offsetX ?? 50;
      avatarOffsetY = char.offsetY ?? 50;
      updatePreviewStyle();
      openModal('charModal');
    }

    function openLibraryCharacterEdit(signature) {
      const character = findLibraryCharacter(signature);
      if (!character) return;
      resetAvatarGesture();
      charModalMode = 'library-edit';
      editingCharName = null;
      editingLibraryCharacterSignature = signature;

      document.getElementById('charModalTitle').innerText = 'ライブラリのキャラクター編集';
      document.getElementById('newCharName').value = character.name;
      document.getElementById('newCharName').disabled = false;
      selectedAvatarBase64 = character.avatar || '';
      document.getElementById('charRoundCheck').checked = character.isRound !== false;
      document.getElementById('charProtagonistCheck').checked = false;
      document.getElementById('charZoomSlider').value = character.zoom || 100;
      avatarOffsetX = character.offsetX ?? 50;
      avatarOffsetY = character.offsetY ?? 50;

      const preview = document.getElementById('avatarPreview');
      preview.style.backgroundImage = character.avatar ? `url(${character.avatar})` : '';
      updatePreviewStyle();
      closeModal('charLibraryModal');
      openModal('charModal');
    }

    function previewAvatar(input) {
      const file = input.files[0];
      if (!file) return;
      compressImageFile(file, 512, 0.86, function(dataUrl) {
        selectedAvatarBase64 = dataUrl;
        avatarOffsetX = 50;
        avatarOffsetY = 50;
        document.getElementById('avatarPreview').style.backgroundImage = `url(${selectedAvatarBase64})`;
        updatePreviewStyle();
      });
    }

    function compressImageFile(file, maxSize, quality, callback) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function() {
          callback(e.target.result);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function confirmSaveCharacter() {
      resetAvatarGesture();
      const name = document.getElementById('newCharName').value.trim();
      if (!name) return;

      const project = state.projects[state.currentProjectId];
      const isRound = document.getElementById('charRoundCheck').checked;
      const isProtagonist = document.getElementById('charProtagonistCheck').checked;
      const zoom = parseInt(document.getElementById('charZoomSlider').value);

      if (charModalMode === 'library-edit') {
        const updated = normalizeLibraryCharacter({
          name,
          avatar: selectedAvatarBase64,
          isRound,
          zoom,
          offsetX: avatarOffsetX,
          offsetY: avatarOffsetY
        });
        if (!updated) return;
        const library = loadCharacterLibrary().filter(item => characterLibrarySignature(item) !== editingLibraryCharacterSignature);
        mergeCharacterIntoLibraryList(library, updated);
        saveCharacterLibrary(library);
        editingLibraryCharacterSignature = null;
        closeModal('charModal');
        renderCharacterLibrary();
        openModal('charLibraryModal');
        return;
      }

      pushUndoSnapshot();
      if (editingCharName === null) {
        if (project.characters.some(c => c.name === name) || name === '情景描写') {
          alert("同名のキャラクターが既に存在します。");
          return;
        }
        if (isProtagonist) project.characters.forEach(c => c.isProtagonist = false);
        const newCharacter = { name: name, avatar: selectedAvatarBase64, isRound: isRound, zoom: zoom, offsetX: avatarOffsetX, offsetY: avatarOffsetY, isProtagonist: isProtagonist };
        project.characters.push(newCharacter);
        registerCharacterInLibrary(newCharacter);
        currentCharacter = name;
      } else {
        const char = project.characters.find(c => c.name === editingCharName);
        if (char) {
          if (name !== editingCharName && (project.characters.some(c => c.name === name) || name === '情景描写')) {
            alert("同名のキャラクターが既に存在します。");
            return;
          }

          project.talks.forEach(t => {
            if (t.charName === editingCharName) {
              t.charName = name;
            }
          });

          char.name = name;
          char.avatar = selectedAvatarBase64;
          char.isRound = isRound;
          char.isProtagonist = isProtagonist;
          char.zoom = zoom;
          char.offsetX = avatarOffsetX;
          char.offsetY = avatarOffsetY;
          registerCharacterInLibrary(char);
          if (isProtagonist) {
            project.characters.forEach(c => {
              if (c !== char) c.isProtagonist = false;
            });
          }
          if (currentCharacter === editingCharName) {
            currentCharacter = name;
          }
        }
      }

      renderCharSelector();
      renderTimeline();
      closeModal('charModal');
      saveState();
    }

    function isProtagonistTalk(project, charName) {
      const char = project.characters.find(c => c.name === charName);
      return !!char?.isProtagonist;
    }

    function formatTalkNumber(index) { return String(index + 1).padStart(3, '0'); }

    function getStageDirection(talk) {
      return String(talk?.stageDirection || talk?.note || '').trim();
    }

    function stageDirectionHtml(talk) {
      const stageDirection = getStageDirection(talk);
      if (!stageDirection) return '';
      return '<div class="stage-direction">' + escapeHtml(stageDirection) + '</div>';
    }

    function scriptColorStorageKey() {
      return SCRIPTMAKER_SCRIPT_COLOR_PREFIX + (state.currentProjectId || 'default');
    }

    function sanitizeScriptColor(value) {
      return ['red', 'blue', 'green', 'yellow'].includes(value) ? value : '';
    }

    function scriptColorClassForCharacter(name) {
      const color = sanitizeScriptColor(editorScriptColorSettings[name] || '');
      return color ? ' script-color-' + color : '';
    }

    function loadEditorScriptColorSettings() {
      try {
        editorScriptColorSettings = JSON.parse(localStorage.getItem(scriptColorStorageKey()) || '{}') || {};
      } catch (error) {
        console.warn('Script color setting load failed', error);
        editorScriptColorSettings = {};
      }
    }

    function saveEditorScriptColorSettings() {
      localStorage.setItem(scriptColorStorageKey(), JSON.stringify(editorScriptColorSettings || {}));
    }

    function scriptColorCharacterNames(project) {
      const names = new Set();
      const excluded = new Set(['情景描写', 'システム', '諠・勹謠丞・']);
      (project?.characters || []).forEach(character => {
        if (character?.name && !excluded.has(character.name)) names.add(character.name);
      });
      (project?.talks || []).forEach(talk => {
        if (talk?.charName && !excluded.has(talk.charName)) names.add(talk.charName);
      });
      return [...names];
    }

    function scriptColorSelectHtml(name, value) {
      const options = [
        ['', '\u306a\u3057'],
        ['red', '\u8d64'],
        ['blue', '\u9752'],
        ['green', '\u7dd1'],
        ['yellow', '\u9ec4\u8272']
      ];
      return '<select data-character="' + escapeHtml(name) + '">' + options.map(([color, label]) =>
        '<option value="' + color + '"' + (value === color ? ' selected' : '') + '>' + label + '</option>'
      ).join('') + '</select>';
    }

    function renderScriptColorSettings() {
      const list = document.getElementById('scriptColorList');
      const project = state.projects[state.currentProjectId];
      if (!list || !project) return;
      loadEditorScriptColorSettings();
      const names = scriptColorCharacterNames(project);
      if (!names.length) {
        list.innerHTML = '<div class="script-color-empty">\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u304c\u3042\u308a\u307e\u305b\u3093\u3002</div>';
        return;
      }
      list.innerHTML = names.map(name => {
        const color = sanitizeScriptColor(editorScriptColorSettings[name] || '');
        return '<label class="script-color-item">' +
          '<span class="script-color-name">' + escapeHtml(name) + '</span>' +
          scriptColorSelectHtml(name, color) +
        '</label>';
      }).join('');
      list.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
          const name = select.dataset.character;
          const color = sanitizeScriptColor(select.value);
          if (color) editorScriptColorSettings[name] = color;
          else delete editorScriptColorSettings[name];
          saveEditorScriptColorSettings();
          renderTimeline();
        });
      });
    }

    function openScriptColorModal() {
      renderScriptColorSettings();
      openModal('scriptColorModal');
    }

    function resetScriptColorSettings() {
      editorScriptColorSettings = {};
      saveEditorScriptColorSettings();
      renderScriptColorSettings();
      renderTimeline();
    }

    function initEditorDisplayModeControls() {
      document.querySelectorAll('input[name="editorDisplayMode"]').forEach(input => {
        input.checked = input.value === editorDisplayMode;
      });
      applyEditorDisplayModeClass();
      updateEditorOrientationHint(false);
    }

    function setEditorDisplayMode(mode) {
      editorDisplayMode = mode === 'script' ? 'script' : 'chat';
      initEditorDisplayModeControls();
      renderTimeline();
      applyProjectWallpaper(true);
      syncEditorOrientationForDisplayMode(true);
    }

    function isTouchScreenForOrientationLock() {
      return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    function updateEditorOrientationHint(show) {
      document.getElementById('editorOrientationHint')?.classList.toggle('hidden', !show);
    }

    async function requestEditorFullscreenForOrientation() {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return true;
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        editorRequestedFullscreenForOrientation = true;
        return true;
      } catch (error) {
        console.warn('Fullscreen request before orientation lock failed', error);
        return false;
      }
    }

    function libraryAvatarHtml(character) {
      if (character.avatar) {
        const size = Number(character.zoom) || 100;
        const posX = character.offsetX ?? 50;
        const posY = character.offsetY ?? 50;
        return '<div class="character-library-avatar" style="background-image:url(' + character.avatar + ');background-size:' + size + '%;background-position:' + posX + '% ' + posY + '%;"></div>';
      }
      return '<div class="character-library-avatar">' + escapeHtml((character.name || '?').slice(0, 2)) + '</div>';
    }

    function openCharacterLibraryModal() {
      syncCharacterLibraryFromProjects();
      renderCharacterLibrary();
      openModal('charLibraryModal');
    }

    function renderCharacterLibrary() {
      const list = document.getElementById('characterLibraryList');
      const project = state.projects[state.currentProjectId];
      if (!list || !project) return;
      const library = loadCharacterLibrary();
      if (!library.length) {
        list.innerHTML = '<div class="character-library-empty">まだライブラリにキャラクターがありません。</div>';
        return;
      }
      list.innerHTML = '';
      library.forEach(character => {
        const signature = characterLibrarySignature(character);
        const isAdded = project.characters.some(item => item.name === character.name);
        const row = document.createElement('div');
        row.className = 'character-library-item' + (isAdded ? ' is-added' : '');
        row.dataset.signature = signature;
        row.innerHTML =
          libraryAvatarHtml(character) +
          '<button class="character-library-main" type="button">' +
            '<span class="character-library-name">' + escapeHtml(character.name) + '</span>' +
            '<span class="character-library-status">' + (isAdded ? '追加済み' : 'タップして追加') + '</span>' +
          '</button>' +
          '<button class="character-library-action" type="button">編集</button>' +
          '<button class="character-library-action character-library-delete" type="button">削除</button>';
        row.querySelector('.character-library-main').onclick = () => addCharacterFromLibrary(signature);
        row.querySelector('.character-library-action').onclick = () => openLibraryCharacterEdit(signature);
        row.querySelector('.character-library-delete').onclick = () => deleteLibraryCharacter(signature);
        row.oncontextmenu = event => {
          event.preventDefault();
          openLibraryCharacterEdit(signature);
        };
        list.appendChild(row);
      });
    }

    function findLibraryCharacter(signature) {
      return loadCharacterLibrary().find(item => characterLibrarySignature(item) === signature) || null;
    }

    function addCharacterFromLibrary(signature) {
      const character = findLibraryCharacter(signature);
      const project = state.projects[state.currentProjectId];
      if (!character || !project) return;
      const existing = project.characters.find(item => item.name === character.name);
      if (existing) {
        currentCharacter = existing.name;
        closeModal('charLibraryModal');
        renderCharSelector();
        return;
      }
      pushUndoSnapshot();
      const isProtagonist = !project.characters.some(item => item.isProtagonist);
      if (isProtagonist) project.characters.forEach(item => item.isProtagonist = false);
      project.characters.push(cloneLibraryCharacterForProject(character, isProtagonist));
      currentCharacter = character.name;
      saveState();
      renderCharSelector();
      renderTimeline();
      closeModal('charLibraryModal');
    }

    function deleteLibraryCharacter(signature) {
      const library = loadCharacterLibrary().filter(item => characterLibrarySignature(item) !== signature);
      saveCharacterLibrary(library);
      renderCharacterLibrary();
    }

    function openNewCharacterFromLibrary() {
      closeModal('charLibraryModal');
      openCharAddModal();
    }

    async function lockEditorLandscapeOrientation(fromUserGesture) {
      if (!isTouchScreenForOrientationLock()) {
        updateEditorOrientationHint(false);
        return;
      }
      if (!screen.orientation?.lock) {
        updateEditorOrientationHint(true);
        return;
      }
      try {
        await screen.orientation.lock('landscape');
        updateEditorOrientationHint(false);
        return;
      } catch (error) {
        console.warn('Landscape orientation lock failed', error);
      }
      if (fromUserGesture && await requestEditorFullscreenForOrientation()) {
        try {
          await screen.orientation.lock('landscape');
          updateEditorOrientationHint(false);
          return;
        } catch (error) {
          console.warn('Landscape orientation lock after fullscreen failed', error);
        }
      }
      updateEditorOrientationHint(true);
    }

    async function unlockEditorOrientation() {
      updateEditorOrientationHint(false);
      try {
        screen.orientation?.unlock?.();
      } catch (error) {
        console.warn('Orientation unlock failed', error);
      }
      if (editorRequestedFullscreenForOrientation && document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.warn('Exit fullscreen after orientation unlock failed', error);
        }
      }
      editorRequestedFullscreenForOrientation = false;
    }

    function syncEditorOrientationForDisplayMode(fromUserGesture = false) {
      if (editorDisplayMode === 'script') {
        lockEditorLandscapeOrientation(fromUserGesture);
      } else {
        unlockEditorOrientation();
      }
    }

    function applyEditorDisplayModeClass() {
      const editorView = document.getElementById('editorView');
      if (!editorView) return;
      editorView.classList.toggle('display-mode-script', editorDisplayMode === 'script');
      editorView.classList.toggle('display-mode-chat', editorDisplayMode !== 'script');
    }

    function sceneWallpaperForTalk(project, talk) {
      const settings = getSceneWallpaperSettings(project);
      if (settings?.enabled && talk?.id) {
        const scene = (settings.scenes || []).find(item => item.image && Array.isArray(item.talkIds) && item.talkIds.includes(talk.id));
        if (scene) return scene;
      }
      return null;
    }

    function wallpaperStyle(wallpaper) {
      if (!wallpaper?.image) return '';
      const size = (wallpaper.size || 100) === 100 ? 'cover' : (wallpaper.size || 100) + '%';
      return 'background-image:url(' + wallpaper.image + ');background-size:' + size + ';background-position:' + (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%;';
    }

    function renderScriptTimeline(project, timeline) {
      timeline.innerHTML = '';
      loadEditorScriptColorSettings();
      (project.talks || []).forEach((talk, index) => {
        if (!talk.id) talk.id = createTalkId();
        const scene = sceneWallpaperForTalk(project, talk);
        const row = document.createElement('article');
        row.className = 'script-row' + scriptColorClassForCharacter(talk.charName) + (editingTalkId === talk.id ? ' inline-edit-target' : '');
        row.dataset.index = index;
        row.dataset.talkId = talk.id;
        row.onclick = function() {
          if (Date.now() < suppressTalkClickUntil || isSortingTalks) return;
          startInlineTalkEditById(row.dataset.talkId);
        };
        row.innerHTML =
          '<div class="script-col script-dialogue">' +
            '<div class="script-meta"><span>' + formatTalkNumber(index) + '</span><strong>' + escapeHtml(talk.charName || '') + '</strong></div>' +
            '<div class="script-text">' + escapeHtml(talk.text || '') + '</div>' +
          '</div>' +
          '<div class="script-col script-stage">' + (getStageDirection(talk) ? escapeHtml(getStageDirection(talk)) : '') + '</div>' +
          '<div class="script-col script-art">' +
            (scene?.image ? '<div class="script-art-image" style="' + wallpaperStyle(scene) + '"></div><span>' + escapeHtml(scene.name || '') + '</span>' : '<div class="script-art-empty">壁紙なし</div>') +
          '</div>';
        timeline.appendChild(row);
      });
      const predicting = document.createElement('div');
      predicting.className = `predicting-msg ${aiStatusMessage ? '' : 'hidden'} ${aiStatusType === 'error' ? 'error' : ''}`;
      predicting.id = 'aiPredicting';
      predicting.innerText = aiStatusMessage || 'AIが予測を更新中...';
      timeline.appendChild(predicting);
      updateSelectedTalkCount();
    }

    function renderTimeline() {
      if (isSortingTalks) {
        pendingTimelineRender = true;
        return;
      }

      const timeline = document.getElementById('talkTimeline');
      timeline.innerHTML = '';
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      applyEditorDisplayModeClass();
      if (editorDisplayMode === 'script') {
        renderScriptTimeline(project, timeline);
        return;
      }

      // 1. 確定済みのトークを描画
      project.talks.forEach((talk, index) => {
        if (!talk.id) talk.id = createTalkId();
        const isScene = talk.charName === '情景描写';
        const isRight = isProtagonistTalk(project, talk.charName) && !isScene;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isScene ? 'scene' : (isRight ? 'right' : 'left')}${editingTalkId === talk.id ? ' inline-edit-target' : ''}`;
        if (state.settings?.showTalkNumbers !== false) bubble.classList.add('with-number');
        bubble.dataset.index = index;
        bubble.dataset.talkId = talk.id;

        bubble.onpointerup = function(e) {
          if (Date.now() < suppressTalkClickUntil || isSortingTalks) return;
          if (e.pointerType === 'touch') {
            e.preventDefault();
            startInlineTalkEditById(bubble.dataset.talkId);
          }
        };
        bubble.onclick = function() {
          if (Date.now() < suppressTalkClickUntil || isSortingTalks) return;
          startInlineTalkEditById(bubble.dataset.talkId);
        };

        let avatarHtml = '';
        if (!isScene) {
          const charInfo = project.characters.find(c => c.name === talk.charName);
          if (charInfo && charInfo.avatar) {
            const radius = charInfo.isRound !== false ? '50%' : '8px';
            const zoom = charInfo.zoom || 100;
            const posX = charInfo.offsetX ?? 50;
            const posY = charInfo.offsetY ?? 50;
            avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${charInfo.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
          } else {
            const short = talk.charName ? talk.charName.substring(0,2) : "??";
            avatarHtml = `<div class="avatar-dummy">${short}</div>`;
          }
        }

        bubble.innerHTML = `
          <input type="checkbox" class="talk-select" ${selectedTalkIndexes.has(index) ? 'checked' : ''} onclick="toggleTalkSelection(event, ${index})">
          ${state.settings?.showTalkNumbers !== false ? '<span class="talk-number">' + formatTalkNumber(index) + '</span>' : ''}
          ${avatarHtml}
          <div class="bubble-content">
            <span class="char-name">${escapeHtml(talk.charName)}</span>
            <div class="message-text">${escapeHtml(talk.text || '')}</div>
            ${stageDirectionHtml(talk)}
            <div class="talk-edit-tools" onclick="event.stopPropagation()">
              <button onclick="moveTalk(event, ${index}, -1)">↑</button>
              <button onclick="moveTalk(event, ${index}, 1)">↓</button>
              <button onclick="openStageDirectionEditor(event, ${index})">&#12488;&#26360;&#12365;</button>
              <button onclick="duplicateTalk(event, ${index})">複製</button>
              <button class="btn-talk-delete" onclick="deleteTalk(event, ${index})">削除</button>
            </div>
          </div>
        `;
        timeline.appendChild(bubble);
      });

      // 2. AI予測結果（半透明・3回分）のレンダリング処理
      if (state.aiToggle && predictedTalks.length > 0) {
        predictedTalks.forEach((talk, idx) => {
          const isScene = talk.charName === '情景描写';
          const isRight = isProtagonistTalk(project, talk.charName) && !isScene;
          const bubble = document.createElement('div');
          bubble.className = `chat-bubble ${isScene ? 'scene' : (isRight ? 'right' : 'left')} ai-predicted`;

          bubble.onclick = function() {
            acceptAiPrediction(idx);
          };

          let avatarHtml = '';
          if (!isScene) {
            const charInfo = project.characters.find(c => c.name === talk.charName);
            if (charInfo && charInfo.avatar) {
              const radius = charInfo.isRound !== false ? '50%' : '8px';
              const zoom = charInfo.zoom || 100;
              const posX = charInfo.offsetX ?? 50;
              const posY = charInfo.offsetY ?? 50;
              avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${charInfo.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
            } else {
              const short = talk.charName ? talk.charName.substring(0,2) : "??";
              avatarHtml = `<div class="avatar-dummy">${short}</div>`;
            }
          }

          bubble.innerHTML = `
            ${avatarHtml}
            <div class="bubble-content">
              <span class="char-name">${escapeHtml(talk.charName)} (予測候補)</span>
              <div class="message-text">${escapeHtml(talk.text || '')}</div>
            </div>
          `;
          timeline.appendChild(bubble);
        });
      }

      // 3. ローディング表記の制御
      const predicting = document.createElement('div');
      predicting.className = `predicting-msg ${aiStatusMessage ? '' : 'hidden'} ${aiStatusType === 'error' ? 'error' : ''}`;
      predicting.id = 'aiPredicting';
      predicting.innerText = aiStatusMessage || 'AIが予測を更新中...';
      timeline.appendChild(predicting);
      
      updateSelectedTalkCount();
      scrollToBottom();
      scheduleSceneWallpaperUpdate();
    }

    function sendMessage() {
      const input = document.getElementById('inputSpeech');
      const text = input.value.trim();
      if (!text) return;

      const project = state.projects[state.currentProjectId];
      if (!project) return;

      if (editingTalkId !== null) {
        const resolved = talkById(editingTalkId);
        if (!resolved) {
          cancelInlineTalkEdit();
          return;
        }
        pushUndoSnapshot();
        project.talks[resolved.index] = { ...resolved.talk, charName: currentCharacter, text: text };
        predictedTalks = [];
        saveState();
        finishInlineTalkEdit();
        renderTimeline();
        updateMetaStats();
        scrollToBottom();
        callGeminiApiForPrediction();
        return;
      }

      pushUndoSnapshot();
      project.talks.push(createTalkRecord(currentCharacter, text));
      predictedTalks = [];

      saveState();
      renderTimeline();
      updateMetaStats();
      clearInputSpeech();
      scrollToBottom();
      callGeminiApiForPrediction();
    }

    function sendMessageOnEnter(e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      sendMessage();
    }

    /* 🎯 【構造修正】Gemini 1.5 FlashのJSON構造に対応*/
    async function callGeminiApiForPrediction(options = {}) {
      const append = !!options.append;
      const count = Math.max(1, Math.min(3, options.count || 3));
      const requestId = ++predictionRequestId;
      if (!state.aiToggle) return;
      if (!state.apiKey) {
        console.log("APIキーが未入力です。");
        return;
      }

      const project = state.projects[state.currentProjectId];
      if (!project || project.talks.length === 0) return;

      aiStatusMessage = append ? "AIが続きを補充中..." : "AIが予測を更新中...";
      aiStatusType = "info";
      const loader = document.getElementById('aiPredicting');
      if (loader) {
        loader.innerText = aiStatusMessage;
        loader.classList.remove('hidden', 'error');
      }
      scrollToBottom();

      const charNames = project.characters.map(c => c.name);
      if (!charNames.includes("情景描写")) charNames.push("情景描写");

      const recentTalks = project.talks.slice(-15);
      const contextText = recentTalks.map(t => `[${t.charName}]: ${t.text}`).join("\n");
      const keptPredictionText = append && predictedTalks.length > 0
        ? predictedTalks.map(t => `[${t.charName}]: ${t.text}`).join("\n")
        : "なし";

      const prompt = `あなたはチャット形式の台本作成アシスタントです。
これまでの台本の流れを読み取り、自然に続く返信を予測してください。

厳守ルール:
- 出力はJSON配列だけにしてください。説明文、挨拶、Markdown、コードフェンスは禁止です。
- JSON配列の要素数は必ず ${count} 件にしてください。
- 各要素は {"charName":"キャラクター名","text":"セリフ"} の形だけにしてください。
- charName は必ず以下の利用可能キャラクター名のいずれかにしてください。
- text はそのまま台本に使える短い1行のセリフにしてください。
- text 内に改行を入れないでください。
- text 内に引用符や記号が必要な場合は、JSONとして正しくエスケープしてください。
- 途中で文章を切らず、必ず閉じ括弧 ] まで出力してください。

利用可能キャラクター:
${charNames.join(', ')}

出力例:
[
  {"charName":"キャラクター名","text":"セリフ"}
]

これまでの台本:
${contextText}

画面に残っている予測候補:
${keptPredictionText}

今回必要な追加予測数: ${count}件
すでに画面に残っている予測候補は作り直さず、その続きを${count}件だけ出してください。`;

      try {
        const data = await requestGeminiPrediction(prompt);
        const rawText = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
        if (!rawText) throw new Error("AIから空の応答が返りました。");

        const parsed = parsePredictionItems(rawText);
        if (!Array.isArray(parsed)) throw new Error("AI応答がJSON配列ではありません。");

        if (requestId !== predictionRequestId) return;

        const newPredictions = normalizePredictionItems(parsed, charNames, project)
          .filter(item => !predictedTalks.some(existing => existing.charName === item.charName && existing.text === item.text))
          .slice(0, count);

        const nextPredictions = append
          ? predictedTalks.concat(newPredictions).slice(0, 3)
          : newPredictions.slice(0, 3);

        if (nextPredictions.length === 0) {
          throw new Error("表示できる予測セリフがありませんでした。");
        }

        predictedTalks = nextPredictions;
        aiStatusMessage = "";
        aiStatusType = "info";
      } catch (e) {
        if (requestId !== predictionRequestId) return;
        console.error("Gemini prediction error:", e);
        aiStatusMessage = "予測の更新に失敗しました。もう一度お試しください。";
        aiStatusType = "error";
      } finally {
        if (requestId !== predictionRequestId) return;
        renderTimeline();
      }
    }

    function normalizePredictionItems(items, charNames, project) {
      const validNames = new Set(charNames);
      return items
        .filter(item => item && typeof item.charName === 'string' && typeof item.text === 'string')
        .map(item => ({
          charName: validNames.has(item.charName.trim()) ? item.charName.trim() : (project.characters[0]?.name || currentCharacter),
          text: cleanupPredictionValue(item.text)
        }))
        .filter(item => item.text);
    }

    async function requestGeminiPrediction(prompt) {
      let lastError = null;

      for (const model of GEMINI_MODEL_CANDIDATES) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 512,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      charName: { type: "STRING" },
                      text: { type: "STRING" }
                    },
                    required: ["charName", "text"]
                  }
                }
              }
            })
          });

          if (response.ok) return response.json();

          const errorData = await response.json().catch(() => ({}));
          const message = errorData.error?.message || `HTTP error: ${response.status}`;
          lastError = new Error(message);

          const canTryNextModel = response.status === 404 || /not found|not supported|model/i.test(message);
          if (!canTryNextModel) break;
        } catch (error) {
          lastError = error;
          break;
        }
      }

      throw lastError || new Error("Gemini API request failed.");
    }

    function parsePredictionItems(text) {
      const jsonText = extractJsonArrayText(text);
      try {
        return JSON.parse(jsonText);
      } catch (error) {
        console.warn("Gemini raw response could not be parsed as JSON:", text);
        const repaired = parseLoosePredictionItems(jsonText);
        if (repaired.length > 0) return repaired;
        throw error;
      }
    }

    function parseLoosePredictionItems(text) {
      const items = [];
      const blocks = extractObjectBlocks(text);
      blocks.forEach(block => {
        const charName = readJsonishStringValue(block, 'charName');
        const itemText = readJsonishStringValue(block, 'text');
        if (charName && itemText) {
          items.push({
            charName: cleanupPredictionValue(charName),
            text: cleanupPredictionValue(itemText)
          });
        }
      });
      return items;
    }

    function extractObjectBlocks(text) {
      const blocks = [];
      let depth = 0;
      let start = -1;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            blocks.push(text.slice(start, i + 1));
            start = -1;
          }
        }
      }

      if (blocks.length === 0) {
        const roughBlocks = text.match(/\{[\s\S]*?(?=\}\s*,|\}\s*\]|$)/g) || [];
        return roughBlocks.map(block => block.endsWith('}') ? block : block + '}');
      }
      return blocks;
    }

    function readJsonishStringValue(block, key) {
      const keyIndex = block.indexOf(`"${key}"`);
      if (keyIndex === -1) return "";
      const colonIndex = block.indexOf(':', keyIndex);
      if (colonIndex === -1) return "";
      const quoteIndex = block.indexOf('"', colonIndex);
      if (quoteIndex === -1) return "";

      let result = "";
      let escaped = false;
      for (let i = quoteIndex + 1; i < block.length; i++) {
        const ch = block[i];
        if (escaped) {
          result += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          const rest = block.slice(i + 1).trimStart();
          if (rest.startsWith(',') || rest.startsWith('}')) return result;
        }
        result += ch;
      }
      return result;
    }

    function cleanupPredictionValue(value) {
      return value.replace(/\s+/g, ' ').trim();
    }

    function extractJsonArrayText(text) {
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      }

      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start !== -1 && (end === -1 || end <= start)) return cleaned.slice(start);
      if (start === -1 || end === -1 || end <= start) return cleaned;
      return cleaned.slice(start, end + 1);
    }

    function acceptAiPrediction(untilIndex) {
      const project = state.projects[state.currentProjectId];
      const prediction = predictedTalks[untilIndex];
      if (prediction && !prediction.isSystem && prediction.charName !== "システム警告") {
        pushUndoSnapshot();
        project.talks.push(createTalkRecord(prediction.charName, prediction.text));
      }
      predictedTalks.splice(untilIndex, 1);
      saveState();
      renderTimeline();
      updateMetaStats();

      const missingCount = Math.max(0, 3 - predictedTalks.length);
      if (missingCount > 0) {
        callGeminiApiForPrediction({ append: true, count: missingCount });
      }
    }

    function openEditTalkModal(index) {
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      startInlineTalkEditById(talk?.id);
    }

    function talkIndexById(talkId) {
      const project = state.projects[state.currentProjectId];
      if (!project || !talkId) return -1;
      return project.talks.findIndex(talk => talk.id === talkId);
    }

    function talkById(talkId) {
      const project = state.projects[state.currentProjectId];
      const index = talkIndexById(talkId);
      return index >= 0 ? { talk: project.talks[index], index } : null;
    }

    function setEditingTalkTarget(talkId) {
      const resolved = talkById(talkId);
      if (!resolved) {
        editingTalkId = null;
        editingTalkIndex = null;
        return null;
      }
      editingTalkId = resolved.talk.id;
      editingTalkIndex = resolved.index;
      return resolved;
    }

    function startInlineTalkEdit(index) {
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      startInlineTalkEditById(talk?.id);
    }

    function startInlineTalkEditById(talkId) {
      const resolved = setEditingTalkTarget(talkId);
      if (!resolved) return;

      const talk = resolved.talk;
      const timeline = document.getElementById('talkTimeline');
      const previousScrollTop = timeline ? timeline.scrollTop : 0;
      currentCharacter = talk.charName;
      const input = document.getElementById('inputSpeech');
      input.value = talk.text;
      resizeInputSpeech(input);
      updateInlineEditState();
      renderCharSelector();
      renderTimeline();
      restoreEditingTalkScrollPosition(previousScrollTop);
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }

    function restoreEditingTalkScrollPosition(previousScrollTop) {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline) return;
      timeline.scrollTop = previousScrollTop;
      setTimeout(() => {
        timeline.scrollTop = previousScrollTop;
        const target = Array.from(timeline.querySelectorAll('[data-talk-id]')).find(item => item.dataset.talkId === editingTalkId);
        if (!target) return;
        const timelineRect = timeline.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        if (targetRect.top < timelineRect.top || targetRect.bottom > timelineRect.bottom) {
          target.scrollIntoView({ block: 'nearest' });
        }
      }, 0);
    }

    function finishInlineTalkEdit() {
      editingTalkIndex = null;
      editingTalkId = null;
      clearInputSpeech();
      updateInlineEditState();
    }

    function cancelInlineTalkEdit() {
      editingTalkIndex = null;
      editingTalkId = null;
      clearInputSpeech();
      updateInlineEditState();
      renderTimeline();
    }

    function clearInputSpeech() {
      const input = document.getElementById('inputSpeech');
      input.value = '';
      input.style.height = '42px';
    }

    function resizeInputSpeech(input) {
      input.style.height = '42px';
      let newHeight = input.scrollHeight;
      if (newHeight < 42) newHeight = 42;
      if (newHeight > 120) newHeight = 120;
      input.style.height = newHeight + 'px';
    }

    function updateInlineEditState() {
      const status = document.getElementById('inlineEditStatus');
      const sendButton = document.getElementById('sendButton');
      if (!status || !sendButton) return;
      const isEditing = editingTalkId !== null && talkIndexById(editingTalkId) >= 0;
      if (isEditing) editingTalkIndex = talkIndexById(editingTalkId);
      status.classList.toggle('hidden', !isEditing);
      document.body.classList.toggle('inline-talk-editing', isEditing);
      sendButton.innerText = isEditing ? '\u66f4\u65b0' : '\u9001\u4fe1';
    }

    function confirmEditTalk() {
      sendMessage();
    }

    function toggleEditMode() {
      isEditMode = !isEditMode;
      const btn = document.getElementById('modeToggleBtn');
      if (isEditMode) {
        btn.innerText = '終了';
        btn.classList.add('editing');
        document.body.classList.add('edit-mode-active');
      } else {
        btn.innerText = '編集';
        btn.classList.remove('editing');
        document.body.classList.remove('edit-mode-active');
        selectedTalkIndexes.clear();
      }
      renderTimeline();
      updateSelectedTalkCount();
    }

    function toggleTalkSelection(event, index) {
      event.stopPropagation();
      if (event.target.checked) {
        selectedTalkIndexes.add(index);
      } else {
        selectedTalkIndexes.delete(index);
      }
      updateSelectedTalkCount();
    }

    function updateSelectedTalkCount() {
      const countEl = document.getElementById('selectedTalkCount');
      if (!countEl) return;
      countEl.innerText = `${selectedTalkIndexes.size}件選択中`;
    }

    function clearTalkSelection() {
      selectedTalkIndexes.clear();
      renderTimeline();
    }

    function deleteSelectedTalks() {
      if (selectedTalkIndexes.size === 0) return;
      const project = state.projects[state.currentProjectId];
      const removedIds = project.talks.filter((_, index) => selectedTalkIndexes.has(index)).map(talk => talk.id).filter(Boolean);
      pushUndoSnapshot();
      project.talks = project.talks.filter((_, index) => !selectedTalkIndexes.has(index));
      removeTalkIdsFromSceneSettings(project, removedIds);
      if (editingTalkId && removedIds.includes(editingTalkId)) {
        editingTalkId = null;
        editingTalkIndex = null;
        clearInputSpeech();
      }
      selectedTalkIndexes.clear();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function deleteTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      pushUndoSnapshot();
      const removed = project.talks[index];
      project.talks.splice(index, 1);
      removeTalkIdsFromSceneSettings(project, removed?.id ? [removed.id] : []);
      if (removed?.id && removed.id === editingTalkId) {
        editingTalkId = null;
        editingTalkIndex = null;
        clearInputSpeech();
      }
      normalizeSelectedTalksAfterMutation();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function openStageDirectionEditor(event, index) {
      event?.stopPropagation?.();
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      if (!talk) return;
      const textarea = document.getElementById('stageDirectionText');
      const target = document.getElementById('stageDirectionTarget');
      const label = document.getElementById('stageDirectionTalkLabel');
      if (target) target.value = String(index);
      if (textarea) {
        textarea.value = getStageDirection(talk);
        setTimeout(() => {
          textarea.focus({ preventScroll: true });
          const end = textarea.value.length;
          textarea.setSelectionRange(end, end);
        }, 50);
      }
      if (label) label.textContent = formatTalkNumber(index) + ' ' + (talk.charName || '') + ': ' + (talk.text || '').slice(0, 32);
      openModal('stageDirectionModal');
    }

    function openCurrentStageDirectionEditor() {
      const index = talkIndexById(editingTalkId);
      if (index < 0) return;
      openStageDirectionEditor({ stopPropagation() {} }, index);
    }

    function saveStageDirection() {
      const project = state.projects[state.currentProjectId];
      const index = parseInt(document.getElementById('stageDirectionTarget')?.value, 10);
      const talk = project?.talks?.[index];
      if (!talk) return;
      const value = (document.getElementById('stageDirectionText')?.value || '').trim();
      pushUndoSnapshot();
      if (value) {
        talk.stageDirection = value;
      } else {
        delete talk.stageDirection;
        delete talk.note;
      }
      predictedTalks = [];
      saveState();
      closeModal('stageDirectionModal');
      renderTimeline();
    }

    function duplicateTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const original = project.talks[index];
      if (!original) return;
      pushUndoSnapshot();
      project.talks.splice(index + 1, 0, createTalkRecord(original.charName, original.text, getStageDirection(original)));
      selectedTalkIndexes.clear();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function moveTalk(event, index, direction) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= project.talks.length) return;

      pushUndoSnapshot();
      const [talk] = project.talks.splice(index, 1);
      project.talks.splice(targetIndex, 0, talk);
      selectedTalkIndexes.clear();
      selectedTalkIndexes.add(targetIndex);
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function normalizeSelectedTalksAfterMutation() {
      const project = state.projects[state.currentProjectId];
      selectedTalkIndexes = new Set([...selectedTalkIndexes].filter(index => index < project.talks.length));
    }

    function initCountControls() {
      const punctuationCheck = document.getElementById('excludePunctuationCheck');
      const customCheck = document.getElementById('excludeCustomCheck');
      const emojiCheck = document.getElementById('excludeEmojiCheck');
      const customInput = document.getElementById('customExcludeChars');
      const showNumbers = document.getElementById('showTalkNumbersCheck');
      const outputNumbers = document.getElementById('outputTalkNumbersCheck');
      const storedCountSetting = loadEditorCountSetting();
      if (emojiCheck) emojiCheck.checked = !!storedCountSetting.excludeEmoji;
      if (showNumbers) showNumbers.checked = state.settings?.showTalkNumbers !== false;
      if (outputNumbers) outputNumbers.checked = !!state.settings?.outputTalkNumbers;
      [punctuationCheck, customCheck].forEach(el => { el?.addEventListener('change', updateMetaStats); });
      emojiCheck?.addEventListener('change', function() {
        saveEditorCountSetting({ excludeEmoji: this.checked });
        updateMetaStats();
      });
      customInput.addEventListener('input', updateMetaStats);
    }

    function initNumberSettingsControls() {
      const showNumbers = document.getElementById('showTalkNumbersCheck');
      const outputNumbers = document.getElementById('outputTalkNumbersCheck');
      if (showNumbers) showNumbers.addEventListener('change', function() { state.settings.showTalkNumbers = this.checked; saveState(); renderTimeline(); });
      if (outputNumbers) outputNumbers.addEventListener('change', function() { state.settings.outputTalkNumbers = this.checked; saveState(); });
    }

    function loadEditorCountSetting() {
      try {
        return JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY) || '{}') || {};
      } catch (error) {
        console.warn('Editor count setting load failed', error);
        return {};
      }
    }

    function saveEditorCountSetting(next) {
      const current = loadEditorCountSetting();
      localStorage.setItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY, JSON.stringify({ ...current, ...next }));
    }

    function isCountableTalk(talk) {
      return talk?.charName !== '\u60c5\u666f\u63cf\u5199' && talk?.charName !== '\u30b7\u30b9\u30c6\u30e0';
    }

    function removeEmojiLikeChars(text) {
      return String(text || '').replace(/\p{Extended_Pictographic}[\uFE0F\uFE0E]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\uFE0E]?)*|\p{Emoji_Presentation}/gu, '');
    }

    function getCountedText(text) {
      let result = text || "";
      const excludePunctuation = document.getElementById('excludePunctuationCheck')?.checked;
      const excludeCustom = document.getElementById('excludeCustomCheck')?.checked;
      const excludeEmoji = document.getElementById('excludeEmojiCheck')?.checked;
      const customChars = document.getElementById('customExcludeChars')?.value || "";

      if (excludePunctuation) {
        result = result.replace(/[、。,.，．！？!?「」『』（）()［］\[\]｛｝{}【】・…:：;；"'“”‘’\-〜～]/g, "");
      }

      if (excludeCustom && customChars) {
        const customSet = new Set([...customChars]);
        result = [...result].filter(ch => !customSet.has(ch)).join("");
      }

      if (excludeEmoji) {
        result = removeEmojiLikeChars(result);
      }

      return result;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    function updateMetaStats() {
      const project = state.projects[state.currentProjectId];
      const output = document.getElementById('countOutput');
      if (!project) return;

      const counts = {};
      let total = 0;
      project.talks.filter(isCountableTalk).forEach(t => {
        const count = [...getCountedText(t.text)].length;
        total += count;
        counts[t.charName] = (counts[t.charName] || 0) + count;
      });

      const breakdown = Object.entries(counts)
        .map(([name, count]) => `<span>${escapeHtml(name)}: ${count}文字</span>`)
        .join("");

      output.innerHTML = `
        <div class="count-total">合計文字数: ${total}文字</div>
        <div class="count-breakdown">${breakdown || '<span>キャラクター別: 0文字</span>'}</div>
      `;
    }

    function updateAiStatus() {
      const isAiOn = document.getElementById('aiToggle').checked;
      if (!isAiOn) {
        predictedTalks = [];
        renderTimeline();
      }
    }

    function scrollToBottom() {
      const timeline = document.getElementById('talkTimeline');
      timeline.scrollTop = timeline.scrollHeight;
    }

    function saveDataAlert() { alert("データを完全に内部保存しました。"); }
    function exportDataAlert() {
      const input = document.getElementById('inputSpeech');
      if (input) input.blur();
      document.body.classList.remove('keyboard-focused');
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      const output = document.getElementById('outputText');
      if (output) output.value = buildOutputText(project);
      openModal('outputModal');
      setTimeout(forceResizeViewport, 50);
    }

    function buildOutputText(project) {
      const includeNumbers = !!state.settings?.outputTalkNumbers;
      return project.talks.map((talk, index) => {
        const prefix = includeNumbers ? formatTalkNumber(index) + ' ' : '';
        if (talk.charName === '\u60c5\u666f\u63cf\u5199') return prefix + '\u3010\u60c5\u666f\u63cf\u5199\u3011\n' + talk.text;
        return prefix + talk.charName + '\uff1a' + talk.text;
      }).join('\n\n');
    }

    async function copyOutputText() {
      const output = document.getElementById('outputText');
      if (!output) return;
      const text = output.value;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          output.focus();
          output.select();
          document.execCommand('copy');
        }
        alert('\u53f0\u672c\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f\u3002');
      } catch (error) {
        console.error('Copy failed:', error);
        alert('\u30b3\u30d4\u30fc\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u30c6\u30ad\u30b9\u30c8\u3092\u9078\u629e\u3057\u3066\u30b3\u30d4\u30fc\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
      }
    }


    function generateShareId() {
      return 'share_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function buildViewerSharePayload(project, viewerPasswordHash, shareId) {
      const snapshot = cloneProject(project);
      ensureTalkIds(snapshot);
      normalizeSceneWallpaperSettings(snapshot);
      return {
        shareId: shareId || project.shareId || generateShareId(),
        title: snapshot.title || '\u53f0\u672c',
        createdAt: project.shareCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewerPasswordHash: viewerPasswordHash || '',
        project: snapshot
      };
    }

    function encodeSharePayload(payload) {
      const json = JSON.stringify(payload);
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      bytes.forEach(byte => { bin += String.fromCharCode(byte); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function normalizeWorkerUrl(value) {
      return String(value || '').trim().replace(/\/+$/, '');
    }

    function viewerBasePath() {
      return SCRIPTMAKER_PUBLIC_VIEWER_URL;
    }

    function configuredWorkerUrl() {
      const input = document.getElementById('shareWorkerUrl');
      const fromInput = normalizeWorkerUrl(input?.value || '');
      const fromStorage = normalizeWorkerUrl(localStorage.getItem(SCRIPTMAKER_SHARE_WORKER_URL_KEY) || '');
      return fromInput || fromStorage || normalizeWorkerUrl(SCRIPTMAKER_SHARE_WORKER_URL);
    }

    function setWorkerInputFromStorage() {
      const input = document.getElementById('shareWorkerUrl');
      if (!input) return;
      const stored = normalizeWorkerUrl(localStorage.getItem(SCRIPTMAKER_SHARE_WORKER_URL_KEY) || SCRIPTMAKER_SHARE_WORKER_URL);
      if (!input.value && stored) input.value = stored;
    }

    function buildViewerShareUrl(payload, workerUrl) {
      const id = encodeURIComponent(payload.shareId);
      return SCRIPTMAKER_PUBLIC_VIEWER_URL + '?id=' + id;
    }

    function buildLongViewerShareUrl(payload) {
      const encoded = encodeSharePayload(payload);
      return viewerBasePath() + '#data=' + encoded;
    }

    function setShareStatus(message, type) {
      const status = document.getElementById('shareStatusText');
      if (!status) return;
      status.className = 'share-meta share-status' + (type ? ' is-' + type : '');
      status.innerText = message || '';
    }

    function currentShareUrl() {
      const text = document.getElementById('shareUrlText');
      return text ? text.value.trim() : '';
    }

    function updateShareModalMode(isPublished) {
      const output = document.getElementById('shareUrlText');
      const createButton = document.getElementById('shareCreateButton');
      const copyButton = document.getElementById('shareCopyButton');
      const openButton = document.getElementById('shareOpenButton');
      const updateButton = document.getElementById('shareUpdateButton');
      if (output) output.classList.toggle('hidden', !isPublished);
      if (createButton) createButton.classList.toggle('hidden', !!isPublished);
      if (copyButton) copyButton.classList.toggle('hidden', !isPublished);
      if (openButton) openButton.classList.toggle('hidden', !isPublished);
      if (updateButton) updateButton.classList.toggle('hidden', !isPublished);
    }

    function selectShareUrl() {
      const text = document.getElementById('shareUrlText');
      if (!text || !text.value) return false;
      text.removeAttribute('readonly');
      text.focus({ preventScroll: true });
      text.select();
      text.setSelectionRange?.(0, text.value.length);
      text.setAttribute('readonly', 'readonly');
      return true;
    }

    async function tryClipboardCopy(value) {
      if (!value) return false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch (error) {
          console.warn('navigator.clipboard failed:', error);
        }
      }
      try {
        const selected = selectShareUrl();
        if (!selected) return false;
        return document.execCommand && document.execCommand('copy') === true;
      } catch (error) {
        console.warn('execCommand copy failed:', error);
        return false;
      }
    }

    function generateCloudProjectId() {
      return 'editor_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function getCurrentProject() {
      return state.projects[state.currentProjectId] || null;
    }

    function buildCloudSyncUrl(projectId) {
      return SCRIPTMAKER_EDITOR_CLOUD_URL + '#cloud=' + encodeURIComponent(projectId);
    }

    function parseCloudProjectIdFromText(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const direct = raw.match(/^(editor_[a-z0-9_,-]+)$/i);
      if (direct) return direct[1];
      const decoded = safeDecode(raw);
      const patterns = [
        /[#?&]cloud=([^&#]+)/i,
        /[#?&]cloudProject=([^&#]+)/i,
        /[#?&]editorProject=([^&#]+)/i,
        /#\/cloud\/([^/?#&]+)/i
      ];
      for (const pattern of patterns) {
        const match = decoded.match(pattern);
        if (match && match[1]) return safeDecode(match[1]).trim();
      }
      const loose = decoded.match(/editor_[a-z0-9_,-]+/i);
      return loose ? loose[0] : '';
    }

    function safeDecode(value) {
      try {
        return decodeURIComponent(String(value || ''));
      } catch (_) {
        return String(value || '');
      }
    }

    function initCloudSyncFromUrl() {
      if (cloudSyncUrlHandled) return;
      const cloudId = parseCloudProjectIdFromText(location.href);
      if (!cloudId) return;
      localStorage.setItem(SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY, cloudId);
      setTimeout(() => {
        if (document.body.classList.contains('auth-locked')) return;
        cloudSyncUrlHandled = true;
        openCloudSyncModal(cloudId);
      }, 250);
    }

    function setCloudSyncStatus(message, type) {
      const status = document.getElementById('cloudSyncStatus');
      if (!status) return;
      status.className = 'share-meta share-status' + (type ? ' is-' + type : '');
      status.innerText = message || '';
    }

    function editorCloudFirebaseConfig() {
      const helper = window.ScriptMakerFirebaseShare;
      if (!helper) throw new Error('Firebaseモジュールを読み込めませんでした。');
      const config = helper.configuredConfig('');
      helper.saveConfig(config);
      return config;
    }

    function currentCloudProjectId() {
      const project = getCurrentProject();
      return project?.cloudProjectId || localStorage.getItem(SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY) || '';
    }

    function updateCloudSyncModalFields(projectId) {
      const input = document.getElementById('cloudProjectIdInput');
      const urlText = document.getElementById('cloudSyncUrlText');
      const id = String(projectId || '').trim();
      if (input) input.value = id;
      if (urlText) {
        urlText.value = id ? buildCloudSyncUrl(id) : '';
        urlText.classList.toggle('hidden', !id);
      }
    }

    function openCloudSyncModal(projectId) {
      const input = document.getElementById('inputSpeech');
      if (input) input.blur();
      document.body.classList.remove('keyboard-focused');
      const id = projectId || currentCloudProjectId();
      updateCloudSyncModalFields(id);
      setCloudSyncStatus(id ? 'このIDでクラウド同期できます。' : '初回は「クラウドに保存」を押すと同期IDが作成されます。', '');
      openModal('cloudSyncModal');
    }

    function buildEditorCloudPayload(project, projectId) {
      const snapshot = cloneProject(project);
      ensureTalkIds(snapshot);
      normalizeSceneWallpaperSettings(snapshot);
      const now = new Date().toISOString();
      const id = projectId || snapshot.cloudProjectId || generateCloudProjectId();
      snapshot.cloudProjectId = id;
      snapshot.cloudUpdatedAt = now;
      if (!snapshot.cloudCreatedAt) snapshot.cloudCreatedAt = project.cloudCreatedAt || now;
      return {
        id,
        title: snapshot.title || 'ScriptMaker',
        data: snapshot,
        schemaVersion: 1,
        createdAt: snapshot.cloudCreatedAt,
        updatedAt: now
      };
    }

    function normalizeCloudPayload(payload) {
      if (!payload) return null;
      const data = payload.data || payload.project || payload;
      if (!data || typeof data !== 'object') return null;
      const project = cloneProject(data);
      project.cloudProjectId = payload.id || project.cloudProjectId;
      project.cloudCreatedAt = payload.createdAt || project.cloudCreatedAt || new Date().toISOString();
      project.cloudUpdatedAt = payload.updatedAt || project.cloudUpdatedAt || '';
      if (!project.folderId || !state.folders?.[project.folderId]) project.folderId = state.currentFolderId || UNCLASSIFIED_FOLDER_ID;
      ensureTalkIds(project);
      normalizeSceneWallpaperSettings(project);
      return { payload, project };
    }

    function findLocalProjectIdByCloudId(cloudId) {
      return Object.keys(state.projects || {}).find(id => state.projects[id]?.cloudProjectId === cloudId) || '';
    }

    async function fetchEditorCloudPayload(cloudId) {
      const helper = window.ScriptMakerFirebaseShare;
      if (!helper?.loadEditorProject) throw new Error('Firebase同期モジュールを読み込めませんでした。');
      const config = editorCloudFirebaseConfig();
      return helper.loadEditorProject(cloudId, config);
    }

    async function saveCurrentProjectToCloud(options = {}) {
      const project = getCurrentProject();
      if (!project) {
        setCloudSyncStatus('クラウド保存するプロジェクトがありません。', 'error');
        return;
      }
      const helper = window.ScriptMakerFirebaseShare;
      if (!helper?.saveEditorProject) {
        setCloudSyncStatus('Firebase同期モジュールを読み込めませんでした。', 'error');
        return;
      }
      const inputId = parseCloudProjectIdFromText(document.getElementById('cloudProjectIdInput')?.value || '');
      const cloudId = inputId || project.cloudProjectId || generateCloudProjectId();
      try {
        setCloudSyncStatus('クラウド側を確認中...', '');
        if (!options.force) {
          const remote = await fetchEditorCloudPayload(cloudId).catch(error => {
            console.warn('Cloud project check failed:', error);
            return null;
          });
          const remoteUpdated = Date.parse(remote?.updatedAt || '');
          const localKnownUpdated = Date.parse(project.cloudUpdatedAt || '');
          if (remote && remoteUpdated && (!localKnownUpdated || remoteUpdated > localKnownUpdated)) {
            const ok = confirm('クラウド側に、この端末より新しいデータがあります。この端末の内容で上書き保存しますか？');
            if (!ok) {
              setCloudSyncStatus('上書き保存をキャンセルしました。「最新データを読み込む」でクラウド版を確認できます。', 'error');
              return;
            }
          }
        }
        setCloudSyncStatus('Firestoreへクラウド保存中...', '');
        const payload = buildEditorCloudPayload(project, cloudId);
        const config = editorCloudFirebaseConfig();
        await helper.saveEditorProject(payload, config);
        project.cloudProjectId = payload.id;
        project.cloudCreatedAt = payload.createdAt;
        project.cloudUpdatedAt = payload.updatedAt;
        localStorage.setItem(SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY, payload.id);
        updateCloudSyncModalFields(payload.id);
        saveState();
        setCloudSyncStatus('クラウドに保存しました。同じ同期URLで別端末から開けます。', 'success');
      } catch (error) {
        console.error('Editor cloud save failed:', error);
        setCloudSyncStatus(error.message || 'クラウド保存に失敗しました。', 'error');
      }
    }

    async function overwriteCloudProject() {
      await saveCurrentProjectToCloud({ force: true });
    }

    async function openCloudProjectFromInput() {
      const cloudId = parseCloudProjectIdFromText(document.getElementById('cloudProjectIdInput')?.value || location.href);
      if (!cloudId) {
        setCloudSyncStatus('クラウドプロジェクトID、または同期URLを入力してください。', 'error');
        return;
      }
      try {
        setCloudSyncStatus('クラウドから読み込み中...', '');
        const payload = await fetchEditorCloudPayload(cloudId);
        const normalized = normalizeCloudPayload(payload);
        if (!normalized) {
          setCloudSyncStatus('クラウドプロジェクトが見つかりませんでした。', 'error');
          return;
        }
        const localId = findLocalProjectIdByCloudId(cloudId) || ('p_cloud_' + Date.now());
        state.projects[localId] = normalized.project;
        state.projects[localId].cloudProjectId = cloudId;
        state.projects[localId].cloudUpdatedAt = normalized.payload.updatedAt || '';
        state.currentProjectId = localId;
        localStorage.setItem(SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY, cloudId);
        saveState();
        closeModal('cloudSyncModal');
        openProject(localId);
      } catch (error) {
        console.error('Editor cloud load failed:', error);
        setCloudSyncStatus(error.message || 'クラウドからの読み込みに失敗しました。', 'error');
      }
    }

    async function loadLatestCloudProject() {
      const project = getCurrentProject();
      const cloudId = parseCloudProjectIdFromText(document.getElementById('cloudProjectIdInput')?.value || project?.cloudProjectId || '');
      if (!cloudId) {
        setCloudSyncStatus('読み込むクラウドプロジェクトIDがありません。', 'error');
        return;
      }
      if (project && project.cloudProjectId && !confirm('クラウドの最新データで、この端末のプロジェクト内容を置き換えますか？')) return;
      await openCloudProjectFromInput();
    }

    function selectCloudSyncUrl() {
      const text = document.getElementById('cloudSyncUrlText');
      if (!text || !text.value) return false;
      text.classList.remove('hidden');
      text.removeAttribute('readonly');
      text.focus({ preventScroll: true });
      text.select();
      text.setSelectionRange?.(0, text.value.length);
      text.setAttribute('readonly', 'readonly');
      return true;
    }

    async function copyCloudSyncUrl() {
      const inputId = parseCloudProjectIdFromText(document.getElementById('cloudProjectIdInput')?.value || '');
      const project = getCurrentProject();
      const cloudId = inputId || project?.cloudProjectId || '';
      if (!cloudId) {
        setCloudSyncStatus('先に「クラウドに保存」で同期IDを作成してください。', 'error');
        return;
      }
      updateCloudSyncModalFields(cloudId);
      const url = buildCloudSyncUrl(cloudId);
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          setCloudSyncStatus('同期URLをコピーしました。別端末のEditorで開けます。', 'success');
          return;
        } catch (error) {
          console.warn('Cloud URL clipboard failed:', error);
        }
      }
      try {
        if (selectCloudSyncUrl() && document.execCommand && document.execCommand('copy') === true) {
          setCloudSyncStatus('同期URLをコピーしました。', 'success');
          return;
        }
      } catch (error) {
        console.warn('Cloud URL execCommand failed:', error);
      }
      selectCloudSyncUrl();
      setCloudSyncStatus('コピーできませんでした。同期URLを長押ししてコピーしてください。', 'error');
    }

    function shareFileName(payload) {
      const title = (payload?.title || 'scriptmaker').replace(/[\\/:*?"<>|]/g, '_').slice(0, 48);
      return title + '_viewer.html';
    }

    function safeHtmlJson(value) {
      return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    }

    function buildDriveViewerHtml(payload) {
      const data = safeHtmlJson(payload);
      return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${payload.title || 'ScriptMaker Viewer'}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f4f6;color:#172033}.app{position:relative;min-height:100dvh;overflow:hidden}.wallpaper{position:fixed;inset:0;background:#f3f4f6 center/cover no-repeat;transition:opacity .45s ease;z-index:0}.wallpaper.next{opacity:0}.header{position:sticky;top:0;z-index:3;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);padding:14px 16px;border-bottom:1px solid rgba(15,23,42,.08)}.label{font-size:12px;color:#64748b;margin:0 0 2px}.title{font-size:19px;margin:0;font-weight:800}.timeline{position:relative;z-index:1;height:calc(100dvh - 62px);overflow:auto;padding:18px 14px 42px}.talk{display:flex;gap:8px;margin:13px 0;align-items:flex-end}.talk.right{justify-content:flex-end}.talk.center{justify-content:center}.avatar{width:44px;height:44px;border-radius:50%;background:#cbd5e1 center/cover no-repeat;flex:0 0 auto;border:2px solid rgba(255,255,255,.85)}.name{font-size:12px;color:#64748b;margin:0 0 3px}.bubble{max-width:min(74vw,520px);padding:11px 14px;border-radius:16px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.08);line-height:1.65;white-space:pre-wrap;word-break:break-word}.right .bubble{background:#dff3ff}.scene .bubble{background:rgba(229,231,235,.94);text-align:center;border-radius:4px;color:#374151;max-width:min(86vw,620px)}.stage{margin-top:6px;padding:7px 10px;border-radius:8px;background:rgba(100,116,139,.18);color:#475569;font-size:12px;line-height:1.5;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid rgba(100,116,139,.18)}.number{display:block;font-size:11px;color:#94a3b8;margin-bottom:2px}.password{position:fixed;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px}.password.hidden{display:none}.password-box{width:min(420px,100%);background:#fff;border-radius:12px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,.16)}.password-box input{width:100%;font-size:16px;padding:12px;border:1px solid #cbd5e1;border-radius:8px}.password-box button{margin-top:12px;width:100%;font-size:16px;font-weight:700;padding:12px;border:0;border-radius:8px;background:#2563eb;color:white}.error{color:#b91c1c;font-size:13px;min-height:18px}</style>
</head>
<body>
<div class="app"><div id="wallpaperA" class="wallpaper"></div><div id="wallpaperB" class="wallpaper next"></div><header class="header"><p class="label">ScriptMaker Viewer</p><h1 id="title" class="title"></h1></header><main id="timeline" class="timeline"></main></div>
<div id="passwordGate" class="password hidden"><div class="password-box"><h2>閲覧パスワード</h2><input id="passwordInput" type="password" autocomplete="current-password"><button id="passwordButton">開く</button><p id="passwordError" class="error"></p></div></div>
<script>
const SHARE_PAYLOAD=${data};
const SCENE_NAME="情景描写";
const SYSTEM_NAME="システム";
let activeWallpaper=0;
let currentWallpaperKey="";
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]));}
async function hashPasswordText(value){const input=String(value||"");if(crypto?.subtle&&TextEncoder){const bytes=new TextEncoder().encode(input);const digest=await crypto.subtle.digest("SHA-256",bytes);return "sha256:"+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")}return "fallback:"+btoa(unescape(encodeURIComponent(input)))}
function project(){return SHARE_PAYLOAD.project||{}}
function character(name){return (project().characters||[]).find(c=>c.name===name)||{}}
function isRight(name){return !!character(name).isProtagonist}
function isSpecial(talk){return talk.charName===SCENE_NAME||talk.charName===SYSTEM_NAME}
function stageHtml(talk){const text=String(talk?.stageDirection||talk?.note||"").trim();return text?'<div class="stage">'+esc(text)+'</div>':""}
function avatarHtml(name){const c=character(name);const image=c.avatar||"";const zoom=c.zoom||100;const ox=c.offsetX??50;const oy=c.offsetY??50;const radius=c.roundAvatar===false?"18%":"50%";const bg=image?"background-image:url("+image+");background-size:"+zoom+"%;background-position:"+ox+"% "+oy+"%;":"";return '<div class="avatar" style="border-radius:'+radius+';'+bg+'"></div>'}
function sceneForTalk(talkId){const settings=project().sceneWallpaperSettings||{};if(!settings.enabled)return null;return (settings.scenes||[]).find(s=>s.image&&Array.isArray(s.talkIds)&&s.talkIds.includes(talkId))||null}
function wallpaperForTalk(talkId){return sceneForTalk(talkId)||project().wallpaper||null}
function wallpaperKey(w){return w&&w.image?[w.image.slice(0,60),w.size||100,w.offsetX??50,w.offsetY??50].join("|"):"none"}
function applyWallpaper(w){const key=wallpaperKey(w);if(key===currentWallpaperKey)return;const layers=[document.getElementById("wallpaperA"),document.getElementById("wallpaperB")];const next=layers[1-activeWallpaper];const current=layers[activeWallpaper];if(w&&w.image){next.style.backgroundImage="url("+w.image+")";next.style.backgroundSize=(w.size||100)===100?"cover":(w.size||100)+"%";next.style.backgroundPosition=(w.offsetX??50)+"% "+(w.offsetY??50)+"%"}else{next.style.backgroundImage=""}next.classList.remove("next");current.classList.add("next");activeWallpaper=1-activeWallpaper;currentWallpaperKey=key}
function currentTalkId(){const items=[...document.querySelectorAll("[data-talk-id]")];const mid=innerHeight/2;let best=null;let dist=Infinity;for(const item of items){const r=item.getBoundingClientRect();const d=Math.abs((r.top+r.bottom)/2-mid);if(d<dist){dist=d;best=item}}return best?.dataset.talkId||""}
function render(){const p=project();document.getElementById("title").textContent=p.title||SHARE_PAYLOAD.title||"台本";const talks=p.talks||[];document.getElementById("timeline").innerHTML=talks.map((talk,index)=>{const special=isSpecial(talk);const side=special?"center":(isRight(talk.charName)?"right":"left");const num=String(index+1).padStart(3,"0");const name=esc(talk.charName||"");const text=esc(talk.text||"");if(special)return '<section class="talk center scene" data-talk-id="'+esc(talk.id||"")+'"><div class="bubble"><span class="number">'+num+'</span>'+text+stageHtml(talk)+'</div></section>';return '<section class="talk '+side+'" data-talk-id="'+esc(talk.id||"")+'">'+(side==="right"?"":avatarHtml(talk.charName))+'<div><p class="name">'+name+'</p><div class="bubble"><span class="number">'+num+'</span>'+text+stageHtml(talk)+'</div></div>'+(side==="right"?avatarHtml(talk.charName):"")+'</section>'}).join("");applyWallpaper(wallpaperForTalk(talks[0]?.id));document.getElementById("timeline").addEventListener("scroll",()=>applyWallpaper(wallpaperForTalk(currentTalkId())),{passive:true})}
async function unlock(){const expected=SHARE_PAYLOAD.viewerPasswordHash||"";if(!expected){render();return}document.getElementById("passwordGate").classList.remove("hidden");document.getElementById("passwordButton").onclick=async()=>{const hash=await hashPasswordText(document.getElementById("passwordInput").value);if(hash===expected){document.getElementById("passwordGate").classList.add("hidden");render()}else{document.getElementById("passwordError").textContent="パスワードが違います"}}}
unlock();
</script>
</body>
</html>`;
    }

    function driveViewerBlob(payload) {
      return new Blob([buildDriveViewerHtml(payload)], { type: 'text/html;charset=utf-8' });
    }

    function ensureSharePayload() {
      if (!pendingSharePayload) throw new Error('共有データがありません。');
      return pendingSharePayload;
    }

    async function openSharedViewer() {
      ensureSharePayload();
      if (!pendingSharePublished) {
        await publishFirebaseShareUrl();
      }
      const url = currentShareUrl();
      if (!url) {
        setShareStatus('Firebase\u3067\u5171\u6709URL\u3092\u4f5c\u6210\u3057\u3066\u304b\u3089Viewer\u3092\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002', 'error');
        return;
      }
      window.open(url, '_blank');
    }

    async function postShareToWorker(payload, workerUrl) {
      const normalizedWorker = normalizeWorkerUrl(workerUrl);
      if (!normalizedWorker) throw new Error('Cloudflare Worker URL\u304c\u672a\u8a2d\u5b9a\u3067\u3059\u3002');
      const response = await fetch(normalizedWorker + '/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error('Worker\u3078\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + response.status + ' ' + detail.slice(0, 160));
      }
      return response.json();
    }

    async function openShareModal() {
      const input = document.getElementById('inputSpeech');
      if (input) input.blur();
      document.body.classList.remove('keyboard-focused');
      const project = state.projects[state.currentProjectId];
      if (!project) {
        alert('\u5171\u6709\u3059\u308b\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u304c\u3042\u308a\u307e\u305b\u3093\u3002');
        return;
      }
      const passwordInput = document.getElementById('shareViewerPassword');
      if (passwordInput && !passwordInput.value) {
        passwordInput.value = localStorage.getItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY) || '';
      }
      const viewerPassword = passwordInput?.value || '';
      const viewerPasswordHash = viewerPassword ? await hashPasswordText(viewerPassword) : '';
      const isPublished = !!project.shareId;
      pendingSharePayload = buildViewerSharePayload(project, viewerPasswordHash, project.shareId);
      pendingSharePublished = isPublished;
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      const firebaseInput = document.getElementById('shareFirebaseConfig');
      if (firebaseInput && window.ScriptMakerFirebaseShare) {
        firebaseInput.value = window.ScriptMakerFirebaseShare.configTextForInput();
      }
      if (output) {
        output.value = isPublished ? buildViewerShareUrl(pendingSharePayload) : '';
      }
      if (meta) meta.innerText = (pendingSharePayload.title || '\u53f0\u672c') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
      updateShareModalMode(isPublished);
      setShareStatus(isPublished
        ? '\u516c\u958b\u6e08\u307f\u3067\u3059\u3002\u53f0\u672c\u3092\u5909\u66f4\u3057\u305f\u5834\u5408\u306f\u300c\u5171\u6709\u30c7\u30fc\u30bf\u3092\u66f4\u65b0\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002'
        : '\u521d\u56de\u306f\u300c\u516c\u958bURL\u3092\u4f5c\u6210\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002', '');
      openModal('shareModal');
    }

    function clearStoredSharePassword() {
      localStorage.removeItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY);
      const input = document.getElementById('shareViewerPassword');
      if (input) input.value = '';
      setShareStatus('\u4fdd\u5b58\u3057\u305f\u95b2\u89a7\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u524a\u9664\u3057\u307e\u3057\u305f\u3002', 'success');
    }

    function downloadDriveViewerHtml() {
      const payload = ensureSharePayload();
      const blob = driveViewerBlob(payload);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = shareFileName(payload);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pendingSharePublished = true;
      setShareStatus('閲覧専用HTMLを保存しました。Google Driveにアップロードして共有リンクを作成してください。', 'success');
    }

    async function shareDriveViewerHtml() {
      const payload = ensureSharePayload();
      const file = new File([driveViewerBlob(payload)], shareFileName(payload), { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({
            title: payload.title || 'ScriptMaker Viewer',
            text: 'ScriptMaker閲覧専用HTML',
            files: [file]
          });
          pendingSharePublished = true;
          setShareStatus('共有シートを開きました。Google Driveを選んで保存してください。', 'success');
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            setShareStatus('共有をキャンセルしました。', '');
            return;
          }
          console.warn('Drive share failed:', error);
        }
      }
      downloadDriveViewerHtml();
      setShareStatus('このブラウザでは直接共有できないため、HTMLを保存しました。Google Driveにアップロードしてください。', 'success');
    }

    async function publishFirebaseShareUrl() {
      if (!pendingSharePayload) {
        await openShareModal();
        if (!pendingSharePayload) return;
      }
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      const helper = window.ScriptMakerFirebaseShare;
      if (!helper) {
        setShareStatus('Firebase\u5171\u6709\u30e2\u30b8\u30e5\u30fc\u30eb\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3002', 'error');
        return;
      }
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      const configText = document.getElementById('shareFirebaseConfig')?.value || '';
      try {
        setShareStatus('Firestore\u3078\u5171\u6709\u30c7\u30fc\u30bf\u3092\u4fdd\u5b58\u4e2d...', '');
        const viewerPassword = document.getElementById('shareViewerPassword')?.value || '';
        if (viewerPassword) {
          localStorage.setItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY, viewerPassword);
        } else {
          localStorage.removeItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY);
        }
        const wasPublished = !!project.shareId;
        if (!project.shareId) {
          project.shareId = pendingSharePayload.shareId || generateShareId();
          project.shareCreatedAt = new Date().toISOString();
        }
        pendingSharePayload = buildViewerSharePayload(project, viewerPassword ? await hashPasswordText(viewerPassword) : '', project.shareId);
        const config = helper.configuredConfig(configText);
        helper.saveConfig(config);
        await helper.saveShare(pendingSharePayload, config);
        saveState();
        const url = buildViewerShareUrl(pendingSharePayload);
        if (output) {
          output.value = url;
          output.classList.remove('hidden');
        }
        updateShareModalMode(true);
        if (meta) meta.innerText = (pendingSharePayload.title || '\u53f0\u672c') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
        pendingSharePublished = true;
        setShareStatus(wasPublished
          ? '\u5171\u6709\u30c7\u30fc\u30bf\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f\u3002\u3053\u306eURL\u3067\u6700\u65b0\u7248\u3092\u898b\u3089\u308c\u307e\u3059\u3002'
          : '\u516c\u958bURL\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f\u3002\u6b21\u306b\u300c\u516c\u958bURL\u3092\u30b3\u30d4\u30fc\u300d\u3092\u62bc\u3057\u3066\u304f\u3060\u3055\u3044\u3002', 'success');
      } catch (error) {
        console.error('Firebase share failed:', error);
        setShareStatus((error.message || 'Firebase\u3078\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002') + ' JSON\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u65b9\u5f0f\u306f\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3068\u3057\u3066\u5229\u7528\u3067\u304d\u307e\u3059\u3002', 'error');
      }
    }

    async function publishWorkerShareUrl() {
      if (!pendingSharePayload) {
        await openShareModal();
        if (!pendingSharePayload) return;
      }
      const workerUrl = configuredWorkerUrl();
      if (!workerUrl) {
        setShareStatus('Cloudflare Worker URL\u304c\u672a\u8a2d\u5b9a\u3067\u3059\u3002', 'error');
        return;
      }
      localStorage.setItem(SCRIPTMAKER_SHARE_WORKER_URL_KEY, workerUrl);
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      try {
        setShareStatus('Worker\u3078\u5171\u6709\u30c7\u30fc\u30bf\u3092\u4fdd\u5b58\u4e2d...', '');
        const result = await postShareToWorker(pendingSharePayload, workerUrl);
        if (result?.id) pendingSharePayload.shareId = result.id;
        const url = buildViewerShareUrl(pendingSharePayload, workerUrl);
        if (output) output.value = url;
        if (meta) meta.innerText = (pendingSharePayload.title || '\u53f0\u672c') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
        pendingSharePublished = true;
        setShareStatus('\u5171\u6709URL\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f\u3002', 'success');
      } catch (error) {
        console.error('Worker share failed:', error);
        setShareStatus(error.message + ' JSON\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u65b9\u5f0f\u3092\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u3068\u3057\u3066\u5229\u7528\u3067\u304d\u307e\u3059\u3002', 'error');
      }
    }

    function downloadShareJson() {
      if (!pendingSharePayload) return;
      const json = JSON.stringify(pendingSharePayload, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pendingSharePayload.shareId + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setShareStatus('JSON\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9\u3057\u307e\u3057\u305f\u3002Share/data/ \u306b\u8ffd\u52a0\u3059\u308b\u3068Viewer\u3067\u958b\u3051\u307e\u3059\u3002', 'success');
    }

    async function recreateProjectShareUrl() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      if (!confirm('\u65b0\u3057\u3044\u516c\u958bURL\u3092\u4f5c\u308a\u76f4\u3057\u307e\u3059\u304b\uff1f\u65e7URL\u306f\u305d\u306e\u307e\u307e\u6b8b\u308a\u307e\u3059\u304c\u3001\u4eca\u5f8c\u306e\u66f4\u65b0\u306f\u65b0URL\u5074\u306b\u53cd\u6620\u3055\u308c\u307e\u3059\u3002')) return;
      project.shareId = generateShareId();
      project.shareCreatedAt = new Date().toISOString();
      saveState();
      const viewerPassword = document.getElementById('shareViewerPassword')?.value || '';
      pendingSharePayload = buildViewerSharePayload(project, viewerPassword ? await hashPasswordText(viewerPassword) : '', project.shareId);
      pendingSharePublished = false;
      await publishFirebaseShareUrl();
    }

    async function copyShareUrl() {
      const text = document.getElementById('shareUrlText');
      if (pendingSharePayload && !pendingSharePublished) {
        await publishFirebaseShareUrl();
      }
      const value = text ? text.value.trim() : '';
      if (!value) {
        setShareStatus('Firebase config\u3092\u8a2d\u5b9a\u3057\u3066\u5171\u6709URL\u3092\u4f5c\u6210\u3057\u3066\u304f\u3060\u3055\u3044\u3002\u30b3\u30d4\u30fc\u3067\u304d\u306a\u3044\u5834\u5408\u306fURL\u3092\u9577\u62bc\u3057\u3057\u3066\u30b3\u30d4\u30fc\u3057\u3066\u304f\u3060\u3055\u3044\u3002', 'error');
        return;
      }
      const ok = await tryClipboardCopy(value);
      if (ok) {
        setShareStatus('\u5171\u6709URL\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f\u3002', 'success');
        return;
      }
      selectShareUrl();
      setShareStatus('\u30b3\u30d4\u30fc\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002URL\u3092\u9577\u62bc\u3057\u3057\u3066\u30b3\u30d4\u30fc\u3057\u3066\u304f\u3060\u3055\u3044\u3002', 'error');
    }

    function downloadOutputText() {
      const project = state.projects[state.currentProjectId];
      const output = document.getElementById('outputText');
      if (!project || !output) return;
      const blob = new Blob([output.value], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeTitle = (project.title || 'script').replace(/[\\/:*?"<>|]/g, '_');
      link.href = url;
      link.download = safeTitle + '.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }

    /* ==========================================
       👑 ドラッグ＆ドロップ削除設定
       ========================================== */
    function initSortableDragAndTrash() {
      if (typeof Sortable === 'undefined') {
        console.warn('SortableJS is not loaded. Drag delete is disabled.');
        return;
      }

      const timeline = document.getElementById('talkTimeline');
      const trashZone = document.getElementById('trashZone');
      let draggingItem = null;

      if (timeline._sortable) {
        timeline._sortable.destroy();
      }

      timeline._sortable = Sortable.create(timeline, {
        animation: 180,
        draggable: '.chat-bubble:not(.ai-predicted)',
        filter: '#aiPredicting, .ai-predicted, .talk-select, .talk-edit-tools, .talk-edit-tools *',
        preventOnFilter: false,
        delay: 400,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        fallbackTolerance: 4,
        fallbackOnBody: true,
        forceFallback: true,
        ghostClass: 'talk-sortable-ghost',
        chosenClass: 'talk-sortable-chosen',
        dragClass: 'talk-sortable-drag',
        swapThreshold: 0.65,
        invertSwap: false,

        onStart: function(evt) {
          isSortingTalks = true;
          pendingTimelineRender = false;
          predictionRequestId++;
          draggingItem = evt.item;
          if (draggingItem) lockDragShape(draggingItem);
          document.body.classList.add('talk-sorting-active');
          trashZone.classList.add('visible');
        },

        onMove: function(evt, originalEvent) {
          updateDragShrink(originalEvent, trashZone, draggingItem);
          return true;
        },

        onEnd: function(evt) {
          const item = draggingItem || evt.item;
          resetDragShrink(item);
          draggingItem = null;
          document.body.classList.remove('talk-sorting-active');
          trashZone.classList.remove('visible');
          trashZone.classList.remove('hover');
          isSortingTalks = false;
          suppressTalkClickUntil = Date.now() + 350;

          if (deleteDraggedTalkIfOverTrash(evt, trashZone, item)) {
            pendingTimelineRender = false;
            return;
          }

          const project = state.projects[state.currentProjectId];
          if (!project) return;

          const oldIndex = getTalkIndexFromItem(item);
          const newIndex = getSortableTalkIndex(evt);
          if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex < 0 || oldIndex >= project.talks.length) {
            pendingTimelineRender = false;
            renderTimeline();
            return;
          }

          if (oldIndex !== newIndex) {
            pushUndoSnapshot();
            const [movedTalk] = project.talks.splice(oldIndex, 1);
            const safeNewIndex = Math.max(0, Math.min(newIndex, project.talks.length));
            project.talks.splice(safeNewIndex, 0, movedTalk);
            saveState();
            updateMetaStats();
          }

          pendingTimelineRender = false;
          renderTimeline();
        }
      });
    }

    function getTalkIndexFromItem(item) {
      if (!item) return NaN;
      const index = Number.parseInt(item.dataset.index, 10);
      return Number.isNaN(index) ? NaN : index;
    }

    function getSortableTalkIndex(evt) {
      if (Number.isInteger(evt.newDraggableIndex)) return evt.newDraggableIndex;
      if (Number.isInteger(evt.newIndex)) {
        const timelineItems = Array.from(document.querySelectorAll('#talkTimeline .chat-bubble:not(.ai-predicted)'));
        return timelineItems.indexOf(evt.item);
      }
      return NaN;
    }

    function deleteDraggedTalkIfOverTrash(evt, trashZone, item) {
      if (!item || !isPointerOverTrash(evt.originalEvent, trashZone)) return false;
      return deleteDraggedTalkByItem(item);
    }

    function deleteDraggedTalkByItem(item) {
      const idx = parseInt(item.dataset.index);
      if (Number.isNaN(idx) || idx < 0) return false;

      const project = state.projects[state.currentProjectId];
      if (!project || idx >= project.talks.length) return false;

      item.dataset.deletedByTrash = 'true';
      pushUndoSnapshot();
      const removed = project.talks[idx];
      project.talks.splice(idx, 1);
      removeTalkIdsFromSceneSettings(project, removed?.id ? [removed.id] : []);
      saveState();
      renderTimeline();
      updateMetaStats();
      return true;
    }

    function isPointerOverTrash(pointerEvent, trashZone) {
      const point = getPointerPoint(pointerEvent);
      if (!point) return false;

      const rect = trashZone.getBoundingClientRect();
      const padding = 24;
      return point.clientX >= rect.left - padding &&
        point.clientX <= rect.right + padding &&
        point.clientY >= rect.top - padding &&
        point.clientY <= rect.bottom + padding;
    }

    function lockDragShape(item) {
      const rect = item.getBoundingClientRect();
      item.dataset.dragWidth = item.style.width || "";
      item.dataset.dragMinWidth = item.style.minWidth || "";
      item.dataset.dragMaxWidth = item.style.maxWidth || "";

      item.classList.add('drag-shrinking');
      item.style.width = `${rect.width}px`;
      item.style.minWidth = `${rect.width}px`;
      item.style.maxWidth = 'none';
    }

    function updateDragShrink(pointerEvent, trashZone, item) {
      if (!pointerEvent || !item) return;
      const point = getPointerPoint(pointerEvent);
      if (!point) return;

      const rect = trashZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = point.clientX - centerX;
      const dy = point.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const shrinkRange = 170;
      const proximity = Math.max(0, Math.min(1, 1 - distance / shrinkRange));
      const scale = 1 - proximity * 0.72;

      item.style.transform = `scale(${scale})`;
      item.style.opacity = String(1 - proximity * 0.35);
      trashZone.classList.toggle('hover', proximity > 0.55);
    }

    function getPointerPoint(event) {
      if (typeof event.clientX === 'number') return event;
      if (event.touches && event.touches.length > 0) return event.touches[0];
      if (event.changedTouches && event.changedTouches.length > 0) return event.changedTouches[0];
      return null;
    }

    function resetDragShrink(item) {
      if (!item) return;
      item.classList.remove('drag-shrinking');
      item.style.transform = '';
      item.style.opacity = '';
      item.style.width = item.dataset.dragWidth || '';
      item.style.minWidth = item.dataset.dragMinWidth || '';
      item.style.maxWidth = item.dataset.dragMaxWidth || '';
      delete item.dataset.dragWidth;
      delete item.dataset.dragMinWidth;
      delete item.dataset.dragMaxWidth;
    }

    /* ==========================================
       ⌨ 環境自動判定型・キーボード対策
       ========================================== */
    function initKeyboardAvoidance() {
      const inputSpeech = document.getElementById('inputSpeech');
      const trashZone = document.getElementById('trashZone');
      const timeline = document.getElementById('talkTimeline');

      inputSpeech.addEventListener('keydown', sendMessageOnEnter);

      originalViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      forceResizeViewport();

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', forceResizeViewport);
        window.visualViewport.addEventListener('scroll', forceResizeViewport);
      } else {
        window.addEventListener('resize', forceResizeViewport);
      }

      // Body/page scrolling must not move the input area. Only the talk timeline scrolls.
      document.addEventListener('touchmove', function(e) {
        if (!document.body.classList.contains('keyboard-focused')) return;
        if (timeline && timeline.contains(e.target)) return;
        e.preventDefault();
      }, { passive: false });

      inputSpeech.addEventListener('focus', () => {
        document.body.classList.add('keyboard-focused');
        trashZone.style.bottom = '80px';
        forceResizeViewport();
        setTimeout(forceResizeViewport, 50);
        setTimeout(forceResizeViewport, 180);
        setTimeout(scrollToBottom, 260);
      });

      inputSpeech.addEventListener('blur', () => {
        document.body.classList.remove('keyboard-focused');
        trashZone.style.bottom = '140px';
        setTimeout(forceResizeViewport, 80);
      });

      inputSpeech.addEventListener('input', function() {
        resizeInputSpeech(this);
        forceResizeViewport();
        scrollToBottom();
      });
    }

    function forceResizeViewport() {
      const editorView = document.getElementById('editorView');
      if (!editorView || editorView.classList.contains('hidden')) return;

      const viewport = window.visualViewport;
      const vh = Math.max(1, Math.floor(viewport ? viewport.height : window.innerHeight));
      document.documentElement.style.setProperty('--app-height', vh + 'px');
      document.body.style.height = vh + 'px';
      editorView.style.height = vh + 'px';
      editorView.style.maxHeight = vh + 'px';
      editorView.style.transform = '';
      scrollToBottom();
    }

    function initWallpaperPan() {
      const preview = document.getElementById('wallpaperPreview');
      if (!preview) return;

      preview.addEventListener('pointerdown', function(e) {
        if (!selectedWallpaperBase64) return;
        e.preventDefault();
        preview.setPointerCapture?.(e.pointerId);
        wallpaperPanStart = { x: e.clientX, y: e.clientY };
        wallpaperPanOffset = { x: wallpaperOffsetX, y: wallpaperOffsetY };
      });

      preview.addEventListener('pointermove', function(e) {
        if (!selectedWallpaperBase64 || !wallpaperPanStart || !wallpaperPanOffset) return;
        e.preventDefault();

        const rect = preview.getBoundingClientRect();
        const dx = e.clientX - wallpaperPanStart.x;
        const dy = e.clientY - wallpaperPanStart.y;
        wallpaperOffsetX = Math.max(0, Math.min(100, wallpaperPanOffset.x - (dx / rect.width) * 100));
        wallpaperOffsetY = Math.max(0, Math.min(100, wallpaperPanOffset.y - (dy / rect.height) * 100));
        updateWallpaperPreviewStyle();
      });

      const resetWallpaperPan = function(e) {
        if (e && typeof e.pointerId !== 'undefined') {
          preview.releasePointerCapture?.(e.pointerId);
        }
        wallpaperPanStart = null;
        wallpaperPanOffset = null;
      };

      preview.addEventListener('pointerup', resetWallpaperPan);
      preview.addEventListener('pointercancel', resetWallpaperPan);
      preview.addEventListener('pointerleave', resetWallpaperPan);
    }

    /* ==========================================
       マルチポインター・ピンチズーム
       ========================================== */
    let activePointers = [];
    let initialPinchDistance = -1;
    let initialPanPoint = null;
    let initialPanOffset = null;

    function resetAvatarGesture() {
      activePointers = [];
      initialPinchDistance = -1;
      initialPanPoint = null;
      initialPanOffset = null;
    }

    function initPointerPinchZoom() {
      const touchArea = document.getElementById('avatarPreview');
      const slider = document.getElementById('charZoomSlider');

      if (!touchArea || !slider) return;

      touchArea.addEventListener('pointerdown', function(e) {
        if (!selectedAvatarBase64) return;
        e.preventDefault();
        touchArea.setPointerCapture?.(e.pointerId);
        activePointers.push(e);
        if (activePointers.length === 2) {
          initialPinchDistance = calcPointerDistance(activePointers[0], activePointers[1]);
          initialPanPoint = null;
          initialPanOffset = null;
        } else if (activePointers.length === 1) {
          initialPanPoint = { x: e.clientX, y: e.clientY };
          initialPanOffset = { x: avatarOffsetX, y: avatarOffsetY };
        }
      });

      touchArea.addEventListener('pointermove', function(e) {
        if (!selectedAvatarBase64) return;
        const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
        if (idx > -1) {
          activePointers[idx] = e;
        }

        if (activePointers.length === 2 && initialPinchDistance > 0) {
          e.preventDefault();
          
          const currentDistance = calcPointerDistance(activePointers[0], activePointers[1]);
          const diff = currentDistance - initialPinchDistance;
          
          let currentZoom = parseInt(slider.value);
          let newZoom = Math.round(currentZoom + diff * 0.4);
          
          if (newZoom < parseInt(slider.min)) newZoom = parseInt(slider.min);
          if (newZoom > parseInt(slider.max)) newZoom = parseInt(slider.max);
          
          slider.value = newZoom;
          updatePreviewStyle(); 
          
          initialPinchDistance = currentDistance; 
        } else if (activePointers.length === 1 && initialPanPoint && initialPanOffset) {
          e.preventDefault();

          const preview = document.getElementById('avatarPreview');
          const rect = preview.getBoundingClientRect();
          const dx = e.clientX - initialPanPoint.x;
          const dy = e.clientY - initialPanPoint.y;

          avatarOffsetX = Math.max(0, Math.min(100, initialPanOffset.x - (dx / rect.width) * 100));
          avatarOffsetY = Math.max(0, Math.min(100, initialPanOffset.y - (dy / rect.height) * 100));
          updatePreviewStyle();
        }
      });

      const resetPinch = function(e) {
        if (e && typeof e.pointerId !== 'undefined') {
          touchArea.releasePointerCapture?.(e.pointerId);
        }
        const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
        if (idx > -1) {
          activePointers.splice(idx, 1);
        }
        if (activePointers.length < 2) {
          initialPinchDistance = -1;
        }
        if (activePointers.length === 0) {
          initialPanPoint = null;
          initialPanOffset = null;
        }
      };

      touchArea.addEventListener('pointerup', resetPinch);
      touchArea.addEventListener('pointercancel', resetPinch);
      touchArea.addEventListener('pointerout', resetPinch);
      touchArea.addEventListener('pointerleave', resetPinch);
    }

    function calcPointerDistance(p1, p2) {
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js').then(function(registration) {
      registration.update();
    }).catch(function(error) {
      console.warn('Service worker registration failed:', error);
    });
  });
}
