// ScriptMaker Editor — データ正規化・キャラクターライブラリ・台本読み込み
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    // 保存データの形式バージョン。今後データ構造を変えるときは、ここで古い形式から変換する処理を追加する
    const SCRIPTMAKER_DATA_SCHEMA_VERSION = 1;

    function migrateStateSchema() {
      const version = Number.isInteger(state.schemaVersion) ? state.schemaVersion : 0;
      // version 0 → 1: 形式は同じ。バージョン番号を付けるだけ
      if (version < SCRIPTMAKER_DATA_SCHEMA_VERSION) state.schemaVersion = SCRIPTMAKER_DATA_SCHEMA_VERSION;
    }

    function normalizeProjectData() {
      migrateStateSchema();
      if (!state.folders || typeof state.folders !== 'object') state.folders = {};
      if (!state.folders[UNCLASSIFIED_FOLDER_ID]) state.folders[UNCLASSIFIED_FOLDER_ID] = { id: UNCLASSIFIED_FOLDER_ID, name: '未分類' };
      if (!state.currentFolderId || !state.folders[state.currentFolderId]) state.currentFolderId = UNCLASSIFIED_FOLDER_ID;
      if (!state.settings || typeof state.settings !== 'object') state.settings = {};
      if (state.settings.showTalkNumbers === undefined) state.settings.showTalkNumbers = true;
      if (state.settings.outputTalkNumbers === undefined) state.settings.outputTalkNumbers = false;
      ensureEditorSyncMetadata();

      Object.entries(state.projects || {}).forEach(([projectId, project]) => {
        if (!project.id) project.id = projectId;
        if (!project.updatedAt) project.updatedAt = state.editorUpdatedAt || SCRIPTMAKER_EDITOR_LEGACY_SYNC_TIME;
        if (!Number.isFinite(Number(project.revision))) project.revision = 0;
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

    function findTrailingStageDirectionRanges(text, options = {}) {
      const original = String(text || '');
      let body = original.trimEnd();
      const ranges = [];
      const trailingBracketPattern = options.fullWidthOnly
        ? /\s*(（([^（）]+)）)\s*$/
        : /\s*(?:(（([^（）]+)）)|(\(([^()]+)\)))\s*$/;

      while (true) {
        const match = body.match(trailingBracketPattern);
        if (!match) break;
        const bracketText = options.fullWidthOnly ? match[1] : (match[1] || match[3] || '');
        const note = String(options.fullWidthOnly ? match[2] : (match[2] || match[4] || '')).trim();
        if (!note) break;
        const bracketOffset = match[0].indexOf(bracketText);
        const start = match.index + bracketOffset;
        ranges.unshift({ start, end: start + bracketText.length, text: bracketText, note });
        body = body.slice(0, match.index).trim();
      }

      if (!body.trim() && ranges.length) return { text: original.trim(), ranges: [] };
      return { text: body.trim(), ranges };
    }

    function extractTrailingStageDirections(text) {
      const parsed = findTrailingStageDirectionRanges(text);
      return {
        text: parsed.text,
        stageDirections: parsed.ranges.map(range => range.note)
      };
    }

    function mergeStageDirectionLines(existing, additions) {
      const lines = String(existing || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const seen = new Set(lines);
      additions.map(item => String(item || '').trim()).filter(Boolean).forEach(item => {
        if (seen.has(item)) return;
        lines.push(item);
        seen.add(item);
      });
      return lines.join('\n');
    }

    function prepareTalkInputForSave(charName, text, existingStageDirection = '') {
      if (charName === '情景描写') {
        return { text: String(text || '').trim(), stageDirection: existingStageDirection };
      }
      const parsed = extractTrailingStageDirections(text);
      return {
        text: parsed.text,
        stageDirection: mergeStageDirectionLines(existingStageDirection, parsed.stageDirections)
      };
    }

    function characterLibrarySignature(character) {
      return String(character?.name || '').trim() + '\u0000' + String(character?.avatarImageId || character?.avatar || '');
    }

    function normalizeLibraryCharacter(character) {
      const name = String(character?.name || '').trim();
      if (!name || name === '情景描写' || name === 'システム') return null;
      return setCharacterAvatarFields({
        name,
        isRound: character.isRound !== false,
        zoom: Number(character.zoom) || 100,
        offsetX: character.offsetX ?? 50,
        offsetY: character.offsetY ?? 50,
        createdAt: character.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, character.avatar, character.avatarImageId);
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
      (list || []).forEach(sanitizeCharacterForStorage);
      try {
        localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, JSON.stringify(list || []));
      } catch (error) {
        // 容量オーバーでも起動処理を止めない（アイコンを画像保存へ移した後に保存し直される）
        console.warn('Character library save failed:', error);
        return;
      }
      scheduleEditorBackupSync();
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

    function updateCharacterLibraryAfterProjectEdit(previousCharacter, updatedCharacter) {
      const previousSignature = characterLibrarySignature(previousCharacter);
      const updatedSignature = characterLibrarySignature(updatedCharacter);
      const list = loadCharacterLibrary().filter(item => {
        const signature = characterLibrarySignature(item);
        if (signature === previousSignature && signature !== updatedSignature) return false;
        return true;
      });
      mergeCharacterIntoLibraryList(list, updatedCharacter);
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
      return setCharacterAvatarFields({
        name: character.name,
        isRound: character.isRound !== false,
        zoom: Number(character.zoom) || 100,
        offsetX: character.offsetX ?? 50,
        offsetY: character.offsetY ?? 50,
        isProtagonist: !!isProtagonist
      }, character.avatar, character.avatarImageId);
    }

    function findLibraryCharacterByName(name) {
      const normalizedName = String(name || '').trim();
      return loadCharacterLibrary().find(character => character.name === normalizedName) || null;
    }

    function openScriptImportModal() {
      pendingScriptImport = { parsed: [], rejected: [] };
      const input = document.getElementById('scriptImportInput');
      const preview = document.getElementById('scriptImportPreview');
      const addButton = document.getElementById('scriptImportAddButton');
      if (input) input.value = '';
      if (preview) preview.innerHTML = '';
      if (addButton) addButton.disabled = true;
      openModal('scriptImportModal');
      setTimeout(() => input?.focus({ preventScroll: true }), 80);
    }

    function isIgnorableScriptImportLine(line) {
      const trimmed = String(line || '').trim();
      return !trimmed || /^```(?:[A-Za-z0-9_-]+)?$/.test(trimmed);
    }

    function parseScriptImportLine(line, lineNumber) {
      if (isIgnorableScriptImportLine(line)) return null;
      const match = String(line).match(/^([^：:]+)[：:](.*)$/);
      if (!match) {
        return { rejected: true, lineNumber, raw: String(line || '').trim(), reason: '話者名とセリフを判別できませんでした' };
      }
      const charName = match[1].trim();
      const text = match[2].trim();
      if (!charName || !text) {
        return { rejected: true, lineNumber, raw: String(line || '').trim(), reason: '話者名またはセリフが空です' };
      }
      return { lineNumber, charName, text };
    }

    function classifyScriptImportRows(rows) {
      const project = state.projects[state.currentProjectId];
      const existingNames = new Set((project?.characters || []).map(character => character.name));
      const plannedNames = new Set(existingNames);
      return rows.map(row => {
        if (row.charName === '情景描写') return { ...row, characterStatus: '情景描写' };
        if (existingNames.has(row.charName)) return { ...row, characterStatus: '既存キャラクター' };
        if (plannedNames.has(row.charName)) return { ...row, characterStatus: '追加予定キャラクター' };
        const libraryCharacter = findLibraryCharacterByName(row.charName);
        const status = libraryCharacter ? 'ライブラリから追加' : '新規キャラクター';
        plannedNames.add(row.charName);
        return { ...row, characterStatus: status };
      });
    }

    function parseScriptImportInput() {
      const input = document.getElementById('scriptImportInput');
      const lines = String(input?.value || '').split(/\r?\n/);
      const parsed = [];
      const rejected = [];
      lines.forEach((line, index) => {
        const result = parseScriptImportLine(line, index + 1);
        if (!result) return;
        if (result.rejected) rejected.push(result);
        else parsed.push(result);
      });
      pendingScriptImport = { parsed: classifyScriptImportRows(parsed), rejected };
      renderScriptImportPreview();
    }

    function renderScriptImportPreview() {
      const preview = document.getElementById('scriptImportPreview');
      const addButton = document.getElementById('scriptImportAddButton');
      if (!preview) return;
      const parsed = pendingScriptImport.parsed || [];
      const rejected = pendingScriptImport.rejected || [];
      const rowsHtml = parsed.map((row, index) =>
        '<div class="script-import-row">' +
          '<strong>' + (index + 1) + '</strong>' +
          '<strong>' + escapeHtml(row.charName) + '</strong>' +
          '<span>' + escapeHtml(row.text) + '</span>' +
          '<em class="script-import-badge">' + escapeHtml(row.characterStatus) + '</em>' +
        '</div>'
      ).join('');
      const rejectedHtml = rejected.map(row =>
        '<div class="script-import-row warning">' +
          '<strong>' + row.lineNumber + '</strong>' +
          '<span>' + escapeHtml(row.raw || '(空行)') + '<br>' + escapeHtml(row.reason) + '</span>' +
        '</div>'
      ).join('');
      preview.innerHTML =
        '<div class="script-import-summary">解析結果: ' + parsed.length + '件 / 解析できなかった行: ' + rejected.length + '件</div>' +
        rowsHtml +
        rejectedHtml;
      if (addButton) addButton.disabled = parsed.length === 0;
    }

    function ensureImportedCharacter(project, charName) {
      if (!project || !charName || charName === '情景描写') return;
      if (!Array.isArray(project.characters)) project.characters = [];
      if (project.characters.some(character => character.name === charName)) return;
      const libraryCharacter = findLibraryCharacterByName(charName);
      const isProtagonist = !project.characters.some(character => character.isProtagonist);
      const character = libraryCharacter
        ? cloneLibraryCharacterForProject(libraryCharacter, isProtagonist)
        : { name: charName, avatar: '', isRound: true, zoom: 100, offsetX: 50, offsetY: 50, isProtagonist };
      project.characters.push(character);
      registerCharacterInLibrary(character);
    }

    function addParsedScriptToProject() {
      const project = state.projects[state.currentProjectId];
      const rows = pendingScriptImport.parsed || [];
      if (!project || !rows.length) return;
      pushUndoSnapshot();
      rows.forEach(row => ensureImportedCharacter(project, row.charName));
      rows.forEach(row => {
        const prepared = prepareTalkInputForSave(row.charName, row.text);
        project.talks.push(createTalkRecord(row.charName, prepared.text, prepared.stageDirection));
      });
      currentCharacter = rows[rows.length - 1].charName || currentCharacter;
      saveState();
      syncCharacterLibraryFromProjects();
      renderCharSelector();
      renderTimeline();
      updateMetaStats();
      closeModal('scriptImportModal');
      scrollToBottom();
    }

    // ===== リンクからの台本取り込み =====
    // Editor/#import=<base64url(UTF-8の台本テキスト)>&title=<プロジェクト名> を開くと、確認後に新規プロジェクトとして取り込む。
    // テキストの形式は「台本読み込み」と同じ（1行＝話者名：セリフ（ト書き））。
    const SCRIPT_URL_IMPORT_MAX_HASH_LENGTH = 60000;
    const SCRIPT_URL_IMPORT_DEFAULT_TITLE = '取り込み台本';
    let pendingUrlScriptImport = null;
    let urlScriptImportHandled = false;

    function decodeBase64UrlText(value) {
      const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
      if (!/^[A-Za-z0-9+/]*$/.test(base64)) throw new Error('invalid base64url');
      const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    function readScriptImportFromUrl(href) {
      const hash = String(href || '').split('#')[1] || '';
      const params = {};
      hash.split('&').forEach(part => {
        const index = part.indexOf('=');
        if (index > 0) params[part.slice(0, index)] = part.slice(index + 1);
      });
      if (params.import === undefined) return null;
      if (hash.length > SCRIPT_URL_IMPORT_MAX_HASH_LENGTH) {
        return { error: '取り込みリンクが長すぎます（' + hash.length + '文字 / 上限' + SCRIPT_URL_IMPORT_MAX_HASH_LENGTH + '文字）。台本を分けて取り込んでください。' };
      }
      let text = '';
      let title = '';
      try {
        text = decodeBase64UrlText(params.import);
        title = params.title ? decodeURIComponent(params.title) : '';
      } catch (error) {
        return { error: 'リンクの台本データを読み取れませんでした。リンクが途中で切れていないか確認してください。' };
      }
      const parsed = [];
      const rejected = [];
      text.split(/\r?\n/).forEach((line, index) => {
        const result = parseScriptImportLine(line, index + 1);
        if (!result) return;
        if (result.rejected) rejected.push(result);
        else parsed.push(result);
      });
      if (!parsed.length) return { error: 'リンクに取り込める台本の行がありませんでした。' };
      return { title: title.trim().slice(0, 80) || SCRIPT_URL_IMPORT_DEFAULT_TITLE, parsed, rejected };
    }

    function clearScriptImportFromUrl() {
      if (!/[#&]import=/.test(location.hash)) return;
      history.replaceState(null, '', location.pathname + location.search);
    }

    function initScriptImportFromUrl() {
      if (urlScriptImportHandled || !editorAppReady || document.body.classList.contains('auth-locked')) return;
      if (!document.getElementById('urlScriptImportModal')) return;
      const result = readScriptImportFromUrl(location.href);
      if (!result) return;
      urlScriptImportHandled = true;
      pendingUrlScriptImport = result.error ? null : result;
      renderUrlScriptImportModal(result);
      openModal('urlScriptImportModal');
    }

    function renderUrlScriptImportModal(result) {
      const message = document.getElementById('urlScriptImportMessage');
      const preview = document.getElementById('urlScriptImportPreview');
      const confirmButton = document.getElementById('urlScriptImportConfirmButton');
      if (confirmButton) confirmButton.classList.toggle('hidden', !!result.error);
      if (result.error) {
        if (message) message.textContent = result.error;
        if (preview) preview.innerHTML = '';
        return;
      }
      if (message) message.textContent = '『' + result.title + '』を新規作成して' + result.parsed.length + '行を取り込みます。';
      const counts = new Map();
      result.parsed.forEach(row => counts.set(row.charName, (counts.get(row.charName) || 0) + 1));
      const speakers = Array.from(counts, ([name, count]) => escapeHtml(name) + '（' + count + '）').join(' / ');
      const rowsHtml = result.parsed.map((row, index) =>
        '<div class="script-import-row compact">' +
          '<strong>' + (index + 1) + '</strong>' +
          '<strong>' + escapeHtml(row.charName) + '</strong>' +
          '<span>' + escapeHtml(row.text) + '</span>' +
        '</div>'
      ).join('');
      const rejectedHtml = result.rejected.map(row =>
        '<div class="script-import-row warning">' +
          '<strong>' + row.lineNumber + '</strong>' +
          '<span>' + escapeHtml(row.raw || '(空行)') + '<br>' + escapeHtml(row.reason) + '（取り込みません）</span>' +
        '</div>'
      ).join('');
      if (preview) {
        preview.innerHTML =
          '<div class="script-import-summary">話者: ' + speakers +
          (result.rejected.length ? '<br>解析できなかった行: ' + result.rejected.length + '件' : '') + '</div>' +
          rowsHtml + rejectedHtml;
      }
    }

    function cancelUrlScriptImport() {
      pendingUrlScriptImport = null;
      clearScriptImportFromUrl();
      closeModal('urlScriptImportModal');
    }

    function confirmUrlScriptImport() {
      const result = pendingUrlScriptImport;
      if (!result) { cancelUrlScriptImport(); return; }
      pendingUrlScriptImport = null;
      clearScriptImportFromUrl();
      closeModal('urlScriptImportModal');
      const id = 'p_' + Date.now();
      state.projects[id] = {
        id,
        title: result.title,
        characters: [],
        talks: [],
        folderId: state.currentFolderId || UNCLASSIFIED_FOLDER_ID,
        revision: 1,
        updatedAt: new Date().toISOString(),
        updatedByDeviceId: getEditorBackupDevice().id
      };
      openProject(id);
      // 取り込み自体は「台本読み込み」と同じ処理（キャラクター追加・ト書き分離・保存・同期）を使う
      pendingScriptImport = { parsed: result.parsed, rejected: result.rejected };
      addParsedScriptToProject();
      renderProjectList();
    }

    window.addEventListener('hashchange', () => {
      if (!/[#&]import=/.test(location.hash)) return;
      urlScriptImportHandled = false;
      initScriptImportFromUrl();
    });
