// ScriptMaker Editor — 定数・状態・起動パスワード
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

const EDITOR_AUTH_HASH_KEY = 'scriptmaker_editor_password_hash_v1';
const EDITOR_AUTH_SESSION_KEY = 'scriptmaker_editor_auth_ok_v1';
const EDITOR_AUTH_SAVED_HASH_KEY = 'scriptmaker_editor_saved_password_hash_v1';
const EDITOR_AUTH_AUTO_LOGIN_KEY = 'scriptmaker_editor_auto_login_v1';
const SCRIPTMAKER_PUBLIC_VIEWER_URL = 'https://small-4c16f.web.app/';
const SCRIPTMAKER_SHARE_WORKER_URL = '';
const SCRIPTMAKER_SHARE_WORKER_URL_KEY = 'scriptmaker_share_worker_url_v1';
const SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY = 'scriptmaker_share_viewer_password_v1';
const SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY = 'scriptmaker_editor_count_settings_v1';
const SCRIPTMAKER_CHARACTER_LIBRARY_KEY = 'scriptmaker_character_library_v1';
const SCRIPTMAKER_EDITOR_CLOUD_URL = 'https://malomalo413.github.io/ScriptMaker/Editor/';
const SCRIPTMAKER_EDITOR_CLOUD_LAST_ID_KEY = 'scriptmaker_editor_cloud_last_project_id_v1';
const SCRIPTMAKER_EDITOR_BACKUP_META_KEY = 'scriptmaker_editor_backup_sync_meta_v1';
const SCRIPTMAKER_EDITOR_BACKUP_DEVICE_KEY = 'scriptmaker_editor_backup_device_v1';
const SCRIPTMAKER_EDITOR_BACKUP_FAIL_KEY = 'scriptmaker_editor_backup_fail_v1';
const SCRIPTMAKER_EDITOR_SYNC_DEBOUNCE_MS = 1200;
const SCRIPTMAKER_EDITOR_SYNC_POLL_MS = 45000;
const SCRIPTMAKER_EDITOR_LEGACY_SYNC_TIME = '1970-01-01T00:00:00.000Z';
const SCRIPTMAKER_SCRIPT_COLOR_PREFIX = 'scriptmaker_editor_script_colors_v1:';
const SCRIPTMAKER_IMAGE_DB_NAME = 'scriptmaker_editor_images_v1';
const SCRIPTMAKER_IMAGE_STORE_NAME = 'images';
const SCRIPTMAKER_WALLPAPER_MAX_SIDE = 1920;
const SCRIPTMAKER_WALLPAPER_WEBP_QUALITY = 0.85;

let state = {
      currentProjectId: null,
      projects: {}
    };

    let currentCharacter = '情景描写';
    let isEditMode = false;
    let editingCharName = null;
    let charModalMode = 'project-add';
    let editingLibraryCharacterSignature = null;
    let selectedAvatarBase64 = "";
    let avatarOffsetX = 50;
    let avatarOffsetY = 50;
    let editingTalkIndex = null;
    let editingTalkId = null;
    let insertTalkTarget = null;
    let inputStageDirectionDraft = '';
    let selectedTalkIndexes = new Set();
    let selectedWallpaperBase64 = "";
    let selectedWallpaperImageId = "";
    let wallpaperSize = 100;
    let wallpaperOffsetX = 50;
    let wallpaperOffsetY = 50;
    let wallpaperPanStart = null;
    let wallpaperPanOffset = null;
    let isSortingTalks = false;
    let pendingTimelineRender = false;
    let suppressTalkClickUntil = 0;
    let editingSceneWallpapers = [];
    let activeSceneWallpaperId = "";
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
    let editorCloudSyncTimer = null;
    let editorCloudPullTimer = null;
    let editorCloudPollTimer = null;
    let editorCloudSyncInFlight = false;
    let editorCloudPullInFlight = false;
    let editorApplyingCloudState = false;
    let editorBackupRealtimeUnsubscribe = null;
    let editorBackupSyncEventsBound = false;
    let editorLastSyncAt = '';
    let editorAppReady = false;
    let characterDragState = null;
    let renamingProjectId = null;
    let pendingScriptImport = { parsed: [], rejected: [] };
    let characterSaveInProgress = false;
    let saveStatusTimer = null;
    let stageDirectionViewportAnchor = null;
    let activeViewportAnchor = null;
    let preserveViewportAfterEdit = false;
    let viewportPreserveReleaseTimer = null;
    let lastViewportLayoutHeight = 0;
    let talkDoubleTapState = null;

    let originalViewportHeight = window.innerHeight;
    async function hashPasswordText(value) {
      const input = String(value || '');
      if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return 'sha256:' + Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
      }
      return 'fallback:' + btoa(unescape(encodeURIComponent(input)));
    }

    // 起動パスワードは「ソルト付きPBKDF2」で保存する（総当たりで元のパスワードを割り出されにくい）
    const EDITOR_PASSWORD_PBKDF2_ITERATIONS = 210000;

    async function pbkdf2PasswordHash(password, saltBytes, iterations) {
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, material, 256);
      return 'pbkdf2$' + iterations + '$' + btoa(String.fromCharCode(...saltBytes)) + '$' + btoa(String.fromCharCode(...new Uint8Array(bits)));
    }

    async function createEditorPasswordHash(password) {
      if (!window.crypto?.subtle) return hashPasswordText(password);
      return pbkdf2PasswordHash(password, crypto.getRandomValues(new Uint8Array(16)), EDITOR_PASSWORD_PBKDF2_ITERATIONS);
    }

    async function verifyEditorPassword(password, storedHash) {
      if (String(storedHash).startsWith('pbkdf2$')) {
        const [, iterations, salt] = storedHash.split('$');
        const saltBytes = Uint8Array.from(atob(salt), char => char.charCodeAt(0));
        return (await pbkdf2PasswordHash(password, saltBytes, Number(iterations))) === storedHash;
      }
      return (await hashPasswordText(password)) === storedHash;
    }

    function editorPasswordHash() {
      return localStorage.getItem(EDITOR_AUTH_HASH_KEY) || '';
    }

    function savedEditorPasswordHash() {
      return localStorage.getItem(EDITOR_AUTH_SAVED_HASH_KEY) || '';
    }

    function editorAutoLoginEnabled() {
      return localStorage.getItem(EDITOR_AUTH_AUTO_LOGIN_KEY) === '1';
    }

    function setEditorAutoLoginEnabled(enabled) {
      localStorage.setItem(EDITOR_AUTH_AUTO_LOGIN_KEY, enabled ? '1' : '0');
    }

    function unlockEditorAuth(hash) {
      if (hash) sessionStorage.setItem(EDITOR_AUTH_SESSION_KEY, hash);
      document.body.classList.remove('auth-locked');
      document.getElementById('editorAuthGate')?.classList.add('hidden');
      initEditorBackupSync();
      setTimeout(initCloudSyncFromUrl, 80);
    }

    function setEditorAuthGateMode(mode) {
      const password = document.getElementById('editorAuthPassword');
      const confirm = document.getElementById('editorAuthConfirm');
      const remember = document.getElementById('editorAuthRemember')?.closest('label');
      const passwordButton = document.getElementById('editorAuthPasswordButton');
      const backupButton = document.getElementById('editorBackupCodeLoginButton');
      if (backupButton) {
        backupButton.classList.remove('hidden');
        backupButton.hidden = false;
        backupButton.style.display = '';
      }
    }

    function showEditorAuthGate() {
      const storedHash = editorPasswordHash();
      const savedHash = savedEditorPasswordHash();
      const gate = document.getElementById('editorAuthGate');
      const title = document.getElementById('editorAuthTitle');
      const help = document.getElementById('editorAuthHelp');
      const confirm = document.getElementById('editorAuthConfirm');
      const password = document.getElementById('editorAuthPassword');
      const remember = document.getElementById('editorAuthRemember');
      const autoLogin = document.getElementById('editorAuthAutoLogin');
      const message = document.getElementById('editorAuthMessage');
      if (!gate || !title || !help || !confirm || !password || !message) return;
      setEditorAuthGateMode('password');
      document.body.classList.add('auth-locked');
      gate.classList.remove('hidden');
      message.textContent = '';
      password.value = '';
      confirm.value = '';
      if (remember) remember.checked = true;
      if (autoLogin) autoLogin.checked = editorAutoLoginEnabled();
      if (storedHash) {
        title.textContent = 'パスワード入力';
        help.textContent = savedHash === storedHash
          ? '保存済みのパスワードがあります。入力せずに「開く」を押すか、パスワードを入力してEditorを開きます。'
          : '設定済みのパスワードを入力するとEditorを開きます。';
        password.placeholder = savedHash === storedHash ? '保存済み。開くを押してください' : 'パスワード';
        confirm.classList.add('hidden');
        confirm.style.display = 'none';
        confirm.hidden = true;
      } else {
        title.textContent = '初回パスワード設定';
        help.textContent = 'この端末でEditorを開くためのパスワードを設定します。';
        password.placeholder = 'パスワード';
        confirm.classList.remove('hidden');
        confirm.style.display = '';
        confirm.hidden = false;
      }
      setTimeout(() => password.focus(), 80);
    }

    function initEditorAuthGate() {
      initEditorAuthControls();
      const storedHash = editorPasswordHash();
      const savedHash = savedEditorPasswordHash();
      const shouldAutoLogin = editorAutoLoginEnabled();
      if (shouldAutoLogin && storedHash && sessionStorage.getItem(EDITOR_AUTH_SESSION_KEY) === storedHash) {
        unlockEditorAuth(storedHash);
        return;
      }
      if (shouldAutoLogin && storedHash && savedHash === storedHash) {
        unlockEditorAuth(storedHash);
        return;
      }
      if (savedHash && savedHash !== storedHash) {
        localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
      }
      showEditorAuthGate();
    }

    async function submitEditorPassword() {
      let storedHash = editorPasswordHash();
      const password = document.getElementById('editorAuthPassword')?.value || '';
      const confirm = document.getElementById('editorAuthConfirm')?.value || '';
      const remember = document.getElementById('editorAuthRemember')?.checked !== false;
      const autoLogin = document.getElementById('editorAuthAutoLogin')?.checked === true;
      const message = document.getElementById('editorAuthMessage');
      setEditorAutoLoginEnabled(autoLogin);
      if (!password && storedHash && savedEditorPasswordHash() === storedHash) {
        if (remember) localStorage.setItem(EDITOR_AUTH_SAVED_HASH_KEY, storedHash);
        else localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
        unlockEditorAuth(storedHash);
        return;
      }
      if (!password) {
        if (message) message.textContent = 'パスワードを入力してください。';
        return;
      }
      if (!storedHash) {
        if (password !== confirm) {
          if (message) message.textContent = '確認用パスワードが一致しません。';
          return;
        }
        const hash = await createEditorPasswordHash(password);
        localStorage.setItem(EDITOR_AUTH_HASH_KEY, hash);
        if (remember) localStorage.setItem(EDITOR_AUTH_SAVED_HASH_KEY, hash);
        else localStorage.removeItem(EDITOR_AUTH_SAVED_HASH_KEY);
        unlockEditorAuth(hash);
        return;
      }
      if (!(await verifyEditorPassword(password, storedHash))) {
        if (message) message.textContent = 'パスワードが違います。';
        return;
      }
      if (!storedHash.startsWith('pbkdf2$') && window.crypto?.subtle) {
        // 旧形式（ソルトなしSHA-256）で保存されていたら、正しく入力できたこのタイミングで新形式に置き換える
        storedHash = await createEditorPasswordHash(password);
        localStorage.setItem(EDITOR_AUTH_HASH_KEY, storedHash);
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
        message.textContent = '保存したパスワードを削除しました。';
        message.classList.remove('is-error');
      }
    }

    function continueEditorOffline() {
      sessionStorage.setItem(EDITOR_AUTH_SESSION_KEY, 'offline');
      document.body.classList.remove('auth-locked');
      document.getElementById('editorAuthGate')?.classList.add('hidden');
      setEditorSyncStatus('オフライン', 'offline', 'この端末のデータだけで続けます。');
      setTimeout(initCloudSyncFromUrl, 80);
    }

    function initEditorAuthControls() {
      const password = document.getElementById('editorAuthPassword');
      const confirm = document.getElementById('editorAuthConfirm');
      const autoLogin = document.getElementById('editorAuthAutoLogin');
      [password, confirm].forEach(input => {
        if (!input || input._scriptmakerEnterBound) return;
        input._scriptmakerEnterBound = true;
        input.addEventListener('keydown', event => {
          if (event.key !== 'Enter' || event.isComposing) return;
          event.preventDefault();
          submitEditorPassword();
        });
      });
      if (autoLogin && !autoLogin._scriptmakerAutoBound) {
        autoLogin._scriptmakerAutoBound = true;
        autoLogin.addEventListener('change', () => setEditorAutoLoginEnabled(autoLogin.checked));
      }
    }

    function logoutEditorAuth() {
      sessionStorage.removeItem(EDITOR_AUTH_SESSION_KEY);
      showEditorAuthGate();
    }
