// ScriptMaker Editor — バックアップコードによる端末間同期
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    function editorBackupMeta() {
      try {
        return JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_BACKUP_META_KEY) || '{}') || {};
      } catch (_) {
        return {};
      }
    }

    function saveEditorBackupMeta(next) {
      localStorage.setItem(SCRIPTMAKER_EDITOR_BACKUP_META_KEY, JSON.stringify({ ...editorBackupMeta(), ...next }));
    }

    function clearEditorBackupMeta() {
      localStorage.removeItem(SCRIPTMAKER_EDITOR_BACKUP_META_KEY);
    }

    function setEditorSyncStatus(text, type = '', detail = '') {
      const status = document.getElementById('editorSyncStatus');
      if (!status) return;
      status.textContent = text;
      status.className = 'editor-sync-status' + (type ? ' ' + type : '');
      status.title = detail || text;
      updateEditorBackupButtonUi();
    }

    function localEditorHasExistingData() {
      return !!(state && state.projects && Object.keys(state.projects).length > 0);
    }

    function updateEditorBackupButtonUi() {
      const button = document.getElementById('editorBackupConnectBtn');
      if (!button) return;
      const meta = editorBackupMeta();
      if (meta.syncSpaceId) {
        button.textContent = 'バックアップ';
        button.classList.add('connected');
        button.title = 'バックアップ・端末引き継ぎ設定を開く';
      } else {
        button.textContent = 'バックアップ';
        button.classList.remove('connected');
        button.title = 'バックアップコードを発行・入力';
      }
    }

    function formatSyncTime(value) {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      return date.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    function collectScriptColorSettingsForSync() {
      const settings = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(SCRIPTMAKER_SCRIPT_COLOR_PREFIX)) continue;
          settings[key] = localStorage.getItem(key) || '{}';
        }
      } catch (error) {
        console.warn('Script color sync collection failed', error);
      }
      return settings;
    }

    function applyScriptColorSettingsFromSync(settings) {
      if (!settings || typeof settings !== 'object') return;
      Object.keys(settings).forEach(key => {
        if (!key.startsWith(SCRIPTMAKER_SCRIPT_COLOR_PREFIX)) return;
        localStorage.setItem(key, String(settings[key] || '{}'));
      });
      loadEditorScriptColorSettings();
    }

    function buildEditorBackupBasePayload() {
      ensureEditorSyncMetadata();
      if (!state.updatedByDeviceId) state.updatedByDeviceId = getEditorBackupDevice().id;
      const updatedAt = state.editorUpdatedAt || new Date().toISOString();
      return {
        id: 'main',
        title: 'ScriptMaker Editor',
        schemaVersion: 2,
        revision: Number(state.editorRevision) || 0,
        updatedAt,
        updatedByDeviceId: state.updatedByDeviceId || '',
        projectIndex: buildProjectSyncIndex(state),
        deletedProjects: state.deletedProjects || {},
        data: {
          state,
          auxiliary: {
            characterLibrary: localStorage.getItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY) || '[]',
            countSettings: localStorage.getItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY) || '{}',
            scriptColorSettings: collectScriptColorSettingsForSync()
          }
        }
      };
    }

    function ensureEditorSyncMetadata() {
      if (!state || typeof state !== 'object') return;
      if (!state.deletedProjects || typeof state.deletedProjects !== 'object') state.deletedProjects = {};
      if (!Number.isFinite(Number(state.editorRevision))) state.editorRevision = 0;
      if (!state.editorUpdatedAt) state.editorUpdatedAt = SCRIPTMAKER_EDITOR_LEGACY_SYNC_TIME;
      Object.entries(state.projects || {}).forEach(([projectId, project]) => {
        if (!project || typeof project !== 'object') return;
        if (!project.id) project.id = projectId;
        if (!Number.isFinite(Number(project.revision))) project.revision = 0;
        if (!project.updatedAt) project.updatedAt = state.editorUpdatedAt || SCRIPTMAKER_EDITOR_LEGACY_SYNC_TIME;
        if (!project.updatedByDeviceId) project.updatedByDeviceId = state.updatedByDeviceId || '';
      });
    }

    function touchEditorSyncMetadata() {
      if (editorApplyingCloudState) return;
      ensureEditorSyncMetadata();
      const now = new Date().toISOString();
      const device = getEditorBackupDevice();
      state.editorUpdatedAt = now;
      state.editorRevision = (Number(state.editorRevision) || 0) + 1;
      state.updatedByDeviceId = device.id;
      const project = state.projects?.[state.currentProjectId];
      if (project) {
        project.updatedAt = now;
        project.revision = (Number(project.revision) || 0) + 1;
        project.updatedByDeviceId = device.id;
      }
    }

    function buildProjectSyncIndex(sourceState) {
      const projects = sourceState?.projects || {};
      const index = {};
      Object.entries(projects).forEach(([id, project]) => {
        index[id] = {
          id,
          title: project?.title || '',
          revision: Number(project?.revision) || 0,
          updatedAt: project?.updatedAt || sourceState?.editorUpdatedAt || '',
          updatedByDeviceId: project?.updatedByDeviceId || sourceState?.updatedByDeviceId || ''
        };
      });
      return index;
    }

    function syncRecordTime(record) {
      const value = record?.updatedAt || record?.deletedAt || record?.cloudUpdatedAt || '';
      if (value && typeof value.toDate === 'function') return value.toDate().getTime();
      if (value && Number.isFinite(value.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function compareSyncRecords(a, b) {
      const aTime = syncRecordTime(a);
      const bTime = syncRecordTime(b);
      if (aTime !== bTime) return aTime > bTime ? 1 : -1;
      const aRevision = Number(a?.revision) || 0;
      const bRevision = Number(b?.revision) || 0;
      if (aRevision !== bRevision) return aRevision > bRevision ? 1 : -1;
      return 0;
    }

    function newerDeletedProject(a, b) {
      if (!a) return b || null;
      if (!b) return a;
      return syncRecordTime(b) > syncRecordTime(a) ? b : a;
    }

    function recordProjectDeletion(projectId, project) {
      ensureEditorSyncMetadata();
      const now = new Date().toISOString();
      const device = getEditorBackupDevice();
      state.deletedProjects[projectId] = {
        id: projectId,
        title: project?.title || '',
        deletedAt: now,
        revision: Number(project?.revision) || 0,
        deletedByDeviceId: device.id
      };
    }

    function renderEditorAfterCloudApply() {
      const anchor = captureTimelineViewport(editingTalkId || insertTalkTarget?.talkId || '');
      normalizeProjectData();
      syncCharacterLibraryFromProjects();
      renderProjectList();
      initCountControls();
      if (state.currentProjectId && !state.projects[state.currentProjectId]) {
        state.currentProjectId = Object.keys(state.projects || {})[0] || null;
      }
      if (state.currentProjectId && state.projects[state.currentProjectId]) {
        document.getElementById('projectTitle').innerText = state.projects[state.currentProjectId].title || '';
        renderCharSelector();
        renderTimeline();
        restoreTimelineViewport(anchor);
        updateMetaStats();
        applyProjectWallpaper(true);
      }
    }

    function applyEditorBackupPayload(payload) {
      const data = payload?.data || {};
      if (!data.state || typeof data.state !== 'object') return false;
      editorApplyingCloudState = true;
      try {
        state = data.state;
        if (!state.editorUpdatedAt) state.editorUpdatedAt = payload.updatedAt || new Date().toISOString();
        ensureEditorSyncMetadata();
        const auxiliary = data.auxiliary || {};
        if (auxiliary.characterLibrary != null) localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, String(auxiliary.characterLibrary));
        if (auxiliary.countSettings != null) localStorage.setItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY, String(auxiliary.countSettings));
        applyScriptColorSettingsFromSync(auxiliary.scriptColorSettings);
        localStorage.setItem('script_assistant_data_v21', JSON.stringify(cloneStateForLocalStorage()));
        renderEditorAfterCloudApply();
        return true;
      } finally {
        editorApplyingCloudState = false;
      }
    }

    function backupAlphabet() { return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; }

    function randomToken(length, alphabet = backupAlphabet()) {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
    }

    function generateBackupCode() {
      return 'SM-' + [0,1,2,3,4].map(() => randomToken(4)).join('-');
    }

    function normalizeBackupCode(value) {
      const raw = String(value || '').toUpperCase().replace(/[\s\u3000-]+/g, '');
      return raw.startsWith('SM') ? 'SM-' + raw.slice(2).replace(/(.{4})/g, '$1-').replace(/-$/,'') : raw.replace(/(.{4})/g, '$1-').replace(/-$/,'');
    }

    function compactBackupCode(value) {
      return String(value || '').toUpperCase().replace(/[\s\u3000-]+/g, '');
    }

    async function hashBackupCode(value) {
      const compact = compactBackupCode(value);
      if (!compact || compact.length < 18) throw new Error('バックアップコードを確認してください。');
      return hashPasswordText('scriptmaker-backup-code:' + compact);
    }

    function safeSyncIdFromHash(hash) {
      return 'sync_' + String(hash || '').replace(/^sha256:/, '').slice(0, 40);
    }

    function getEditorBackupDevice() {
      try {
        const saved = JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_BACKUP_DEVICE_KEY) || '{}') || {};
        if (saved.id && saved.token) return saved;
      } catch (_) {}
      const device = {
        id: 'device_' + randomToken(18).toLowerCase(),
        token: randomToken(32),
        name: detectDeviceName(),
        registeredAt: new Date().toISOString()
      };
      localStorage.setItem(SCRIPTMAKER_EDITOR_BACKUP_DEVICE_KEY, JSON.stringify(device));
      return device;
    }

    function detectDeviceName() {
      const ua = navigator.userAgent || '';
      if (/Pixel/i.test(ua)) return 'Pixel / Android';
      if (/Android/i.test(ua)) return 'Android';
      if (/iPhone/i.test(ua)) return 'iPhone';
      if (/iPad/i.test(ua)) return 'iPad';
      if (/Windows/i.test(ua)) return 'Windows PC';
      if (/Macintosh/i.test(ua)) return 'Mac';
      return 'この端末';
    }

    function buildEditorBackupPayload() {
      const payload = buildEditorBackupBasePayload();
      payload.id = 'main';
      payload.title = 'ScriptMaker Backup';
      payload.schemaVersion = 3;
      payload.syncMeta = editorBackupMeta();
      return payload;
    }

    function summarizeBackupPayload(payload) {
      const data = payload?.data || {};
      const nextState = data.state || {};
      const projects = nextState.projects || {};
      const folders = nextState.folders || {};
      const bytes = new Blob([JSON.stringify(payload || {})]).size;
      return { projects: Object.keys(projects).length, folders: Object.keys(folders).length, updatedAt: payload?.updatedAt || nextState.editorUpdatedAt || '', bytes };
    }

    function mergeEditorBackupPayload(payload, options = {}) {
      const remoteState = payload?.data?.state;
      if (!remoteState || typeof remoteState !== 'object') return { applied: false, localNewer: false, remoteNewer: false };

      const localState = JSON.parse(JSON.stringify(state || {}));
      const remote = JSON.parse(JSON.stringify(remoteState));
      localState.projects = localState.projects || {};
      remote.projects = remote.projects || {};
      localState.folders = localState.folders || {};
      remote.folders = remote.folders || {};
      localState.deletedProjects = localState.deletedProjects || {};
      remote.deletedProjects = remote.deletedProjects || {};

      const merged = JSON.parse(JSON.stringify(localState));
      merged.projects = { ...(localState.projects || {}) };
      merged.folders = { ...(remote.folders || {}), ...(localState.folders || {}) };
      merged.deletedProjects = { ...(localState.deletedProjects || {}) };

      let applied = false;
      let localNewer = false;
      let remoteNewer = false;

      Object.entries(remote.deletedProjects || {}).forEach(([id, tombstone]) => {
        const current = merged.deletedProjects[id];
        merged.deletedProjects[id] = newerDeletedProject(current, tombstone);
      });

      Object.entries(remote.projects || {}).forEach(([id, remoteProject]) => {
        const tombstone = merged.deletedProjects[id];
        if (tombstone && syncRecordTime(tombstone) >= syncRecordTime(remoteProject)) return;
        const localProject = merged.projects[id];
        if (!localProject) {
          merged.projects[id] = remoteProject;
          applied = true;
          remoteNewer = true;
          return;
        }
        const comparison = compareSyncRecords(remoteProject, localProject);
        if (comparison > 0) {
          merged.projects[id] = remoteProject;
          applied = true;
          remoteNewer = true;
        } else if (comparison < 0) {
          localNewer = true;
        }
      });

      Object.entries(merged.projects || {}).forEach(([id, localProject]) => {
        const remoteProject = remote.projects[id];
        const remoteDeletion = remote.deletedProjects?.[id];
        if (remoteDeletion && syncRecordTime(remoteDeletion) >= syncRecordTime(localProject)) {
          delete merged.projects[id];
          applied = true;
          remoteNewer = true;
          return;
        }
        if (!remoteProject) localNewer = true;
      });

      const remoteGlobal = { revision: Number(remote.editorRevision) || 0, updatedAt: remote.editorUpdatedAt || payload.updatedAt || '' };
      const localGlobal = { revision: Number(localState.editorRevision) || 0, updatedAt: localState.editorUpdatedAt || '' };
      const globalComparison = compareSyncRecords(remoteGlobal, localGlobal);
      if (globalComparison > 0) {
        merged.settings = remote.settings || merged.settings;
        merged.currentFolderId = remote.currentFolderId || merged.currentFolderId;
        if (!merged.currentProjectId || !merged.projects[merged.currentProjectId]) {
          merged.currentProjectId = remote.currentProjectId || Object.keys(merged.projects || {})[0] || null;
        }
        remoteNewer = true;
      } else if (globalComparison < 0) {
        localNewer = true;
      }

      const localTime = syncRecordTime(localGlobal);
      const remoteTime = syncRecordTime(remoteGlobal);
      merged.editorRevision = Math.max(Number(localState.editorRevision) || 0, Number(remote.editorRevision) || 0);
      merged.editorUpdatedAt = remoteTime > localTime ? (remote.editorUpdatedAt || payload.updatedAt || localState.editorUpdatedAt) : (localState.editorUpdatedAt || remote.editorUpdatedAt || payload.updatedAt || new Date().toISOString());
      merged.updatedByDeviceId = remoteTime > localTime ? (remote.updatedByDeviceId || payload.updatedByDeviceId || '') : (localState.updatedByDeviceId || '');

      if (!applied && !remoteNewer) return { applied: false, localNewer, remoteNewer };

      editorApplyingCloudState = true;
      try {
        state = merged;
        const auxiliary = payload?.data?.auxiliary || {};
        if (auxiliary.characterLibrary != null) localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, String(auxiliary.characterLibrary));
        if (auxiliary.countSettings != null) localStorage.setItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY, String(auxiliary.countSettings));
        applyScriptColorSettingsFromSync(auxiliary.scriptColorSettings);
        localStorage.setItem('script_assistant_data_v21', JSON.stringify(cloneStateForLocalStorage()));
        renderEditorAfterCloudApply();
      } finally {
        editorApplyingCloudState = false;
      }

      return { applied: true, localNewer, remoteNewer };
    }

    function scheduleEditorBackupSync(delay = SCRIPTMAKER_EDITOR_SYNC_DEBOUNCE_MS) {
      if (editorApplyingCloudState || !editorBackupMeta().syncSpaceId) return;
      saveEditorBackupMeta({ pending: true });
      setEditorSyncStatus('未同期の変更あり', 'offline');
      clearTimeout(editorCloudSyncTimer);
      editorCloudSyncTimer = setTimeout(() => saveEditorBackupNow(), delay);
    }

    async function editorBackupFirebaseConfig() {
      const helper = window.ScriptMakerFirebaseShare;
      if (!helper) throw new Error('Firebase module is not loaded.');
      const config = helper.configuredConfig('');
      helper.saveConfig(config);
      return config;
    }

    async function registerEditorBackupDevice(config, syncSpaceId, codeHash) {
      const helper = window.ScriptMakerFirebaseShare;
      const device = getEditorBackupDevice();
      const deviceTokenHash = await hashPasswordText('scriptmaker-device-token:' + device.token);
      await helper.saveEditorDevice(syncSpaceId, device.id, { name: device.name, deviceTokenHash, registeredAt: device.registeredAt, lastSyncAt: new Date().toISOString() }, config);
      saveEditorBackupMeta({ syncSpaceId, recoveryCodeHash: codeHash, deviceId: device.id, deviceName: device.name });
    }

    async function saveEditorBackupNow(options = {}) {
      const meta = editorBackupMeta();
      if (!meta.syncSpaceId || !window.ScriptMakerFirebaseShare) return false;
      if (!navigator.onLine) {
        saveEditorBackupMeta({ pending: true });
        setEditorSyncStatus('オフライン・端末に保存済み', 'offline');
        return false;
      }
      if (editorCloudSyncInFlight) { if (!options.skipReschedule) scheduleEditorBackupSync(1500); return false; }
      editorCloudSyncInFlight = true;
      setEditorSyncStatus('同期中…', 'syncing');
      try {
        const helper = window.ScriptMakerFirebaseShare;
        const config = await editorBackupFirebaseConfig();
        let payload = buildEditorBackupPayload();
        if (!options.skipRemoteCheck) {
          const remotePayload = await helper.loadEditorBackupState(meta.syncSpaceId, config).catch(error => {
            console.warn('Pre-upload cloud check failed:', error);
            return null;
          });
          const merge = mergeEditorBackupPayload(remotePayload);
          if (merge.applied && !merge.localNewer && !meta.pending && !options.forceUpload) {
            editorLastSyncAt = new Date().toISOString();
            saveEditorBackupMeta({ lastSyncAt: editorLastSyncAt, pending: false, lastCloudUpdatedAt: remotePayload?.updatedAt || '' });
            setEditorSyncStatus('同期済み ' + formatSyncTime(editorLastSyncAt), 'synced');
            updateEditorBackupModal();
            return true;
          }
          payload = buildEditorBackupPayload();
        }
        await helper.saveEditorBackupState(meta.syncSpaceId, payload, config);
        try {
          await helper.saveEditorSyncSpaceMeta(meta.syncSpaceId, { schemaVersion: 1, recoveryCodeHash: meta.recoveryCodeHash, updatedAt: payload.updatedAt, revision: payload.revision, updatedByDeviceId: payload.updatedByDeviceId }, config);
        } catch (metaError) {
          console.warn('Backup metadata save failed.', metaError);
        }
        try {
          await registerEditorBackupDevice(config, meta.syncSpaceId, meta.recoveryCodeHash || '');
        } catch (deviceError) {
          console.warn('Backup device registration failed.', deviceError);
        }
        editorLastSyncAt = new Date().toISOString();
        saveEditorBackupMeta({ lastSyncAt: editorLastSyncAt, pending: false, lastCloudUpdatedAt: payload.updatedAt });
        setEditorSyncStatus('同期済み ' + formatSyncTime(editorLastSyncAt), 'synced');
        updateEditorBackupModal();
        return true;
      } catch (error) {
        console.error('Editor backup sync failed:', error);
        saveEditorBackupMeta({ pending: true, lastError: error.message || String(error) });
        setEditorSyncStatus('同期失敗', 'error', error.message || String(error));
        return false;
      } finally {
        editorCloudSyncInFlight = false;
      }
    }

    function scheduleEditorBackupCloudCheck(delay = 0, force = false) {
      if (!editorBackupMeta().syncSpaceId || editorApplyingCloudState) return;
      clearTimeout(editorCloudPullTimer);
      editorCloudPullTimer = setTimeout(() => loadEditorBackupCloudState(force), delay);
    }

    async function loadEditorBackupCloudState(force = false) {
      const meta = editorBackupMeta();
      if (!meta.syncSpaceId || !window.ScriptMakerFirebaseShare || !navigator.onLine) return false;
      if (!editorAppReady) { setTimeout(() => loadEditorBackupCloudState(force), 250); return false; }
      if (editorCloudPullInFlight) return false;
      editorCloudPullInFlight = true;
      setEditorSyncStatus('同期確認中…', 'syncing');
      try {
        const helper = window.ScriptMakerFirebaseShare;
        const config = await editorBackupFirebaseConfig();
        const payload = await helper.loadEditorBackupState(meta.syncSpaceId, config);
        if (payload) {
          const merge = force ? (applyEditorBackupPayload(payload), { applied: true, localNewer: false }) : mergeEditorBackupPayload(payload);
          editorLastSyncAt = new Date().toISOString();
          saveEditorBackupMeta({ lastSyncAt: editorLastSyncAt, pending: false, lastCloudUpdatedAt: payload.updatedAt || '' });
          setEditorSyncStatus('同期済み ' + formatSyncTime(editorLastSyncAt), 'synced');
          updateEditorBackupModal();
          if (merge.localNewer) scheduleEditorBackupSync(SCRIPTMAKER_EDITOR_SYNC_DEBOUNCE_MS);
          return true;
        }
        if (localEditorHasExistingData()) {
          saveEditorBackupMeta({ pending: true });
          await saveEditorBackupNow({ skipReschedule: true, skipRemoteCheck: true, forceUpload: true });
        }
        return true;
      } catch (error) {
        console.error('Editor backup load failed:', error);
        setEditorSyncStatus('同期失敗', 'error', error.message || String(error));
        return false;
      } finally {
        editorCloudPullInFlight = false;
      }
    }

    function stopEditorBackupRealtimeListener() {
      if (typeof editorBackupRealtimeUnsubscribe === 'function') {
        try { editorBackupRealtimeUnsubscribe(); } catch (_) {}
      }
      editorBackupRealtimeUnsubscribe = null;
    }

    async function startEditorBackupRealtimeListener() {
      const meta = editorBackupMeta();
      if (!meta.syncSpaceId || !navigator.onLine || !window.ScriptMakerFirebaseShare?.listenEditorBackupStateMeta) return;
      stopEditorBackupRealtimeListener();
      try {
        const config = await editorBackupFirebaseConfig();
        const deviceId = getEditorBackupDevice().id;
        editorBackupRealtimeUnsubscribe = await window.ScriptMakerFirebaseShare.listenEditorBackupStateMeta(meta.syncSpaceId, (cloudMeta, error) => {
          if (error) {
            console.warn('Editor realtime sync listener failed:', error);
            return;
          }
          if (!cloudMeta) return;
          if (cloudMeta.updatedByDeviceId && cloudMeta.updatedByDeviceId === deviceId) return;
          const cloudUpdated = syncRecordTime(cloudMeta);
          const knownUpdated = Date.parse(editorBackupMeta().lastCloudUpdatedAt || '') || 0;
          const localUpdated = Date.parse(state.editorUpdatedAt || '') || 0;
          if (cloudUpdated > Math.max(knownUpdated, localUpdated - 1)) {
            setEditorSyncStatus('別端末の更新を確認中…', 'syncing');
            scheduleEditorBackupCloudCheck(600);
          }
        }, config);
      } catch (error) {
        console.warn('Editor realtime sync setup failed:', error);
      }
    }

    function restartEditorBackupPolling() {
      if (editorCloudPollTimer) clearInterval(editorCloudPollTimer);
      if (!editorBackupMeta().syncSpaceId) return;
      editorCloudPollTimer = setInterval(() => {
        if (document.hidden || !navigator.onLine) return;
        scheduleEditorBackupCloudCheck(0);
      }, SCRIPTMAKER_EDITOR_SYNC_POLL_MS);
    }

    function initEditorBackupSync() {
      updateEditorBackupButtonUi();
      const meta = editorBackupMeta();
      if (meta.syncSpaceId) {
        setEditorSyncStatus(meta.pending ? '未同期の変更あり' : '同期準備OK', meta.pending ? 'offline' : 'synced');
        if (navigator.onLine) {
          setTimeout(() => loadEditorBackupCloudState(), 800);
          startEditorBackupRealtimeListener();
          restartEditorBackupPolling();
        }
      } else {
        setEditorSyncStatus('未設定', 'offline');
      }
      if (editorBackupSyncEventsBound) return;
      editorBackupSyncEventsBound = true;
      window.addEventListener('online', () => {
        startEditorBackupRealtimeListener();
        restartEditorBackupPolling();
        scheduleEditorBackupCloudCheck(200);
        saveEditorBackupNow();
      });
      window.addEventListener('offline', () => {
        stopEditorBackupRealtimeListener();
        setEditorSyncStatus('オフライン・端末に保存済み', 'offline');
      });
      window.addEventListener('focus', () => scheduleEditorBackupCloudCheck(150));
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) scheduleEditorBackupCloudCheck(150);
      });
    }

    async function issueEditorBackupCode() {
      if (!window.ScriptMakerFirebaseShare) { setEditorBackupStatus('Firebase module is not loaded.', 'error'); return; }
      if (!localEditorHasExistingData()) { setEditorBackupStatus('バックアップする台本データがありません。', 'error'); return; }
      const code = generateBackupCode();
      try {
        setEditorBackupStatus('バックアップを作成中…', '');
        const codeHash = await hashBackupCode(code);
        const syncSpaceId = safeSyncIdFromHash(codeHash);
        const config = await editorBackupFirebaseConfig();
        const payload = buildEditorBackupPayload();
        const helper = window.ScriptMakerFirebaseShare;
        await helper.saveEditorBackupState(syncSpaceId, payload, config);
        try {
          await helper.saveEditorRecoveryCode(codeHash, syncSpaceId, { createdAt: new Date().toISOString() }, config);
          await helper.saveEditorSyncSpaceMeta(syncSpaceId, { schemaVersion: 1, recoveryCodeHash: codeHash, updatedAt: payload.updatedAt, revision: payload.revision, updatedByDeviceId: payload.updatedByDeviceId }, config);
        } catch (metaError) {
          console.warn('Backup metadata save failed; deterministic code id will be used.', metaError);
        }
        try {
          await registerEditorBackupDevice(config, syncSpaceId, codeHash);
        } catch (deviceError) {
          console.warn('Backup device registration failed.', deviceError);
        }
        localStorage.setItem('scriptmaker_editor_backup_code_plain_v1', code);
        saveEditorBackupMeta({ syncSpaceId, recoveryCodeHash: codeHash, codeSavedAt: new Date().toISOString(), pending: false, lastSyncAt: new Date().toISOString() });
        setEditorBackupCodeOutput(code);
        setEditorBackupStatus('バックアップコードを発行しました。第三者に共有しないでください。', 'success');
        startEditorBackupRealtimeListener();
        restartEditorBackupPolling();
        updateEditorBackupModal();
      } catch (error) {
        console.error('Backup issue failed:', error);
        setEditorBackupStatus('バックアップを作成できませんでした。端末内のデータは保持されています。', 'error');
      }
    }

    function setEditorBackupCodeOutput(code) {
      const output = document.getElementById('editorBackupCodeText');
      const label = document.getElementById('editorBackupCodeTextLabel');
      if (output) { output.value = code || ''; output.classList.toggle('hidden', !code); }
      if (label) label.classList.toggle('hidden', !code);
    }

    function setEditorBackupStatus(message, type) {
      const status = document.getElementById('editorBackupStatus');
      if (!status) return;
      status.className = 'share-meta share-status' + (type ? ' is-' + type : '');
      status.innerText = message || '';
    }

    async function copyEditorBackupCode() {
      const code = document.getElementById('editorBackupCodeText')?.value || localStorage.getItem('scriptmaker_editor_backup_code_plain_v1') || '';
      if (!code) { setEditorBackupStatus('表示できるバックアップコードがありません。', 'error'); return; }
      const ok = await tryClipboardCopyValue(code, document.getElementById('editorBackupCodeText'));
      setEditorBackupStatus(ok ? 'バックアップコードをコピーしました。第三者に共有しないでください。' : 'コピーできませんでした。コードを長押ししてコピーしてください。', ok ? 'success' : 'error');
    }

    async function tryClipboardCopyValue(value, element) {
      if (!value) return false;
      if (navigator.clipboard && window.isSecureContext) { try { await navigator.clipboard.writeText(value); return true; } catch (_) {} }
      try { if (element) { element.classList.remove('hidden'); element.focus({ preventScroll: true }); element.select(); element.setSelectionRange?.(0, value.length); } return document.execCommand && document.execCommand('copy') === true; } catch (_) { return false; }
    }

    function openBackupQrImagePicker() {
      const input = document.getElementById('editorBackupQrInput');
      if (!input) return;
      input.value = '';
      input.click();
    }

    async function readBackupQrImage(input) {
      const file = input?.files?.[0];
      if (!file) return;
      if (!('BarcodeDetector' in window)) {
        setEditorBackupStatus('このブラウザはQRコード読み取りに対応していません。コードをコピーして入力してください。', 'error');
        return;
      }
      try {
        setEditorBackupStatus('QRコードを読み取り中…', '');
        const bitmap = await createImageBitmap(file);
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const results = await detector.detect(bitmap);
        bitmap.close?.();
        const value = results?.[0]?.rawValue || '';
        if (!value) {
          setEditorBackupStatus('QRコードを読み取れませんでした。コードを直接入力してください。', 'error');
          return;
        }
        const codeInput = document.getElementById('editorBackupCodeInput');
        if (codeInput) {
          codeInput.value = normalizeBackupCode(value);
          codeInput.focus({ preventScroll: true });
        }
        setEditorBackupStatus('QRコードを読み取りました。内容を確認して「コードを読み込む」を押してください。', 'success');
      } catch (error) {
        console.error('Backup QR read failed:', error);
        setEditorBackupStatus('QRコードを読み取れませんでした。コードを直接入力してください。', 'error');
      }
    }

    function openEditorBackupMenu() { updateEditorBackupModal(); openModal('editorBackupModal'); }

    function openBackupCodeImportFromAuth() { updateEditorBackupModal(true); openModal('editorBackupModal'); setTimeout(() => document.getElementById('editorBackupCodeInput')?.focus(), 80); }

    async function updateEditorBackupModal(focusImport = false) {
      const meta = editorBackupMeta();
      const info = document.getElementById('editorBackupInfo');
      const status = document.getElementById('editorBackupConnectionStatus');
      const input = document.getElementById('editorBackupCodeInput');
      if (info) info.textContent = meta.syncSpaceId ? 'バックアップコード設定済み。別端末でも同じデータを同期できます。' : 'バックアップコードを発行すると、別端末へ台本データを引き継げます。';
      if (status) status.textContent = meta.syncSpaceId ? '最終同期: ' + (meta.lastSyncAt ? formatSyncTime(meta.lastSyncAt) : '未同期') : '未設定';
      setEditorBackupCodeOutput(localStorage.getItem('scriptmaker_editor_backup_code_plain_v1') || '');
      if (input && focusImport) input.value = '';
      if (meta.syncSpaceId && window.ScriptMakerFirebaseShare?.listEditorDevices) {
        try { const devices = await window.ScriptMakerFirebaseShare.listEditorDevices(meta.syncSpaceId, await editorBackupFirebaseConfig()); renderEditorBackupDevices(devices); } catch (error) { console.warn('Device list failed:', error); }
      } else { renderEditorBackupDevices([]); }
    }

    function renderEditorBackupDevices(devices) {
      const list = document.getElementById('editorBackupDeviceList');
      if (!list) return;
      const current = getEditorBackupDevice().id;
      list.innerHTML = (devices || []).length ? devices.map(device => '<div class="backup-device-row"><strong>' + escapeHtml(device.name || '端末') + '</strong><span>' + (device.id === current ? 'この端末' : '接続済み') + '</span></div>').join('') : '<div class="backup-device-row">接続済み端末はまだありません。</div>';
    }

    async function loadBackupCodeFromInput() {
      const input = document.getElementById('editorBackupCodeInput');
      const code = normalizeBackupCode(input?.value || '');
      if (input) input.value = code;
      if (!navigator.onLine) { setEditorBackupStatus('現在オフラインのため、バックアップコードを確認できません。', 'error'); return; }
      if (isBackupCodeRateLimited()) { setEditorBackupStatus('連続試行が多すぎます。少し待ってからお試しください。', 'error'); return; }
      try {
        setEditorBackupStatus('バックアップコードを確認中…', '');
        const codeHash = await hashBackupCode(code);
        const helper = window.ScriptMakerFirebaseShare;
        const config = await editorBackupFirebaseConfig();
        const resolved = await helper.resolveEditorRecoveryCode(codeHash, config).catch(error => {
          console.warn('Recovery code lookup failed; using deterministic sync id.', error);
          return null;
        });
        if (resolved?.inactive) { setEditorBackupStatus('このバックアップコードは現在使用できません。', 'error'); return; }
        const syncSpaceId = resolved?.syncSpaceId || safeSyncIdFromHash(codeHash);
        const payload = await helper.loadEditorBackupState(syncSpaceId, config);
        if (!payload) { setEditorBackupStatus('データを読み込めませんでした。この端末のデータは変更されていません。', 'error'); return; }
        const summary = summarizeBackupPayload(payload);
        const hasLocal = localEditorHasExistingData();
        const message = 'バックアップが見つかりました\n\nプロジェクト数: ' + summary.projects + '\u4ef6\nフォルダ数: ' + summary.folders + '\u4ef6\n最終更新: ' + (summary.updatedAt ? new Date(summary.updatedAt).toLocaleString('ja-JP') : '不明') + '\nデータ容量: ' + Math.ceil(summary.bytes / 1024) + 'KB\n\n' + (hasLocal ? 'この端末にも台本データがあります。OKで両方を残して読み込みます。' : 'この端末へ読み込みますか？');
        if (!confirm(message)) return;
        importBackupPayloadKeepingLocal(payload);
        try {
          await registerEditorBackupDevice(config, syncSpaceId, codeHash);
        } catch (deviceError) {
          console.warn('Backup device registration failed.', deviceError);
        }
        localStorage.setItem('scriptmaker_editor_backup_code_plain_v1', code);
        saveEditorBackupMeta({ syncSpaceId, recoveryCodeHash: codeHash, pending: false, lastSyncAt: new Date().toISOString() });
        saveState();
        startEditorBackupRealtimeListener();
        restartEditorBackupPolling();
        closeModal('editorBackupModal');
        document.getElementById('editorAuthGate')?.classList.add('hidden');
        document.body.classList.remove('auth-locked');
        renderProjectList();
        setEditorSyncStatus('同期済み ' + formatSyncTime(new Date().toISOString()), 'synced');
      } catch (error) { console.error('Backup import failed:', error); setEditorBackupStatus(error.message || 'データを読み込めませんでした。', 'error'); }
    }

    function importBackupPayloadKeepingLocal(payload) {
      const data = payload?.data || {};
      const incoming = data.state || {};
      if (!incoming || typeof incoming !== 'object') throw new Error('読み込めるバックアップデータではありません。');
      const merged = JSON.parse(JSON.stringify(incoming));
      if (localEditorHasExistingData()) {
        merged.projects = { ...(incoming.projects || {}) };
        Object.entries(state.projects || {}).forEach(([id, project]) => { const nextId = merged.projects[id] ? id + '_local_' + Date.now() : id; merged.projects[nextId] = project; });
        merged.folders = { ...(incoming.folders || {}), ...(state.folders || {}) };
        merged.currentProjectId = incoming.currentProjectId || Object.keys(merged.projects)[0] || null;
      }
      editorApplyingCloudState = true;
      try { state = merged; localStorage.setItem('script_assistant_data_v21', JSON.stringify(cloneStateForLocalStorage())); applyEditorBackupPayload({ ...payload, data: { ...data, state } }); } finally { editorApplyingCloudState = false; }
    }

    function isBackupCodeRateLimited() { try { const data = JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_BACKUP_FAIL_KEY) || '{}') || {}; return data.until && Date.now() < data.until; } catch (_) { return false; } }

    function recordBackupCodeFailure() { let data = {}; try { data = JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_BACKUP_FAIL_KEY) || '{}') || {}; } catch (_) {} const count = (data.count || 0) + 1; const until = count >= 5 ? Date.now() + Math.min(300000, count * 30000) : 0; localStorage.setItem(SCRIPTMAKER_EDITOR_BACKUP_FAIL_KEY, JSON.stringify({ count, until })); }

    async function regenerateEditorBackupCode() {
      const meta = editorBackupMeta();
      if (!meta.syncSpaceId) { await issueEditorBackupCode(); return; }
      if (!confirm('コードを再発行すると、古いバックアップコードを使った新しい端末の登録ができなくなります。')) return;
      const oldHash = meta.recoveryCodeHash || '';
      const code = generateBackupCode();
      try {
        setEditorBackupStatus('新しいコードを発行中…', '');
        const codeHash = await hashBackupCode(code);
        const config = await editorBackupFirebaseConfig();
        const helper = window.ScriptMakerFirebaseShare;
        if (oldHash) await helper.disableEditorRecoveryCode(oldHash, config);
        await helper.saveEditorRecoveryCode(codeHash, meta.syncSpaceId, { createdAt: new Date().toISOString() }, config);
        await helper.saveEditorSyncSpaceMeta(meta.syncSpaceId, { schemaVersion: 1, recoveryCodeHash: codeHash }, config);
        localStorage.setItem('scriptmaker_editor_backup_code_plain_v1', code);
        saveEditorBackupMeta({ recoveryCodeHash: codeHash });
        setEditorBackupCodeOutput(code);
        setEditorBackupStatus('新しいバックアップコードを発行しました。', 'success');
      } catch (error) { console.error('Backup regenerate failed:', error); setEditorBackupStatus('コードを再発行できませんでした。', 'error'); }
    }

    function unlinkEditorBackupDevice() {
      if (!confirm('この端末のバックアップ連携を解除しますか？端末内の台本データは削除されません。')) return;
      stopEditorBackupRealtimeListener();
      if (editorCloudPollTimer) clearInterval(editorCloudPollTimer);
      editorCloudPollTimer = null;
      clearEditorBackupMeta();
      localStorage.removeItem('scriptmaker_editor_backup_code_plain_v1');
      setEditorSyncStatus('未設定', 'offline');
      updateEditorBackupModal();
    }
