// ScriptMaker Editor — 出力・共有・クラウド同期
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    async function saveDataAlert() {
      saveState();
      const synced = await saveEditorBackupNow({ skipReschedule: true });
      alert(synced ? "ローカル保存とバックアップ同期が完了しました。" : "ローカルへ保存しました。バックアップコード未設定、または通信復帰後に同期します。");
    }
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
        if (talk.charName === '情景描写') return prefix + '【情景描写】\n' + talk.text;
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
        alert('台本をコピーしました。');
      } catch (error) {
        console.error('Copy failed:', error);
        alert('コピーに失敗しました。テキストを選択してコピーしてください。');
      }
    }


    function generateShareId() {
      // 共有URLから推測されないよう、暗号論的な乱数でIDを作る
      if (window.ScriptMakerShareCrypto && window.crypto?.getRandomValues) return window.ScriptMakerShareCrypto.randomId('share_');
      return 'share_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    let viewerEncryptionSupportPromise = null;

    // 公開中のViewerが暗号化された共有を開けるか確認する（Viewerを更新するまでは暗号化しない）
    function viewerSupportsEncryptedShares() {
      if (!window.ScriptMakerShareCrypto || !window.crypto?.subtle) return Promise.resolve(false);
      if (!viewerEncryptionSupportPromise) {
        viewerEncryptionSupportPromise = fetch(SCRIPTMAKER_PUBLIC_VIEWER_URL + 'capabilities.json', { cache: 'no-store' })
          .then(response => response.ok ? response.json() : null)
          .then(info => Number(info?.encryptedShares) >= 1)
          .catch(() => false);
      }
      return viewerEncryptionSupportPromise;
    }

    // Firestoreに保存する共有データ。パスワードがあり、Viewerが対応していれば中身を暗号化する
    async function sharePayloadForStorage(payload, viewerPassword) {
      if (!viewerPassword || !(await viewerSupportsEncryptedShares())) return { payload, encrypted: false };
      const plain = { ...payload, viewerPasswordHash: '' };
      const encrypted = await window.ScriptMakerShareCrypto.encryptJson(plain, viewerPassword);
      return {
        payload: {
          shareId: payload.shareId,
          title: '',
          schemaVersion: 2,
          createdAt: payload.createdAt,
          updatedAt: payload.updatedAt,
          encrypted
        },
        encrypted: true
      };
    }

    async function buildViewerSharePayload(project, viewerPasswordHash, shareId) {
      const snapshot = cloneProject(project);
      loadEditorScriptColorSettings();
      snapshot.scriptColorSettings = {};
      Object.entries(editorScriptColorSettings || {}).forEach(([name, color]) => {
        const safeColor = sanitizeScriptColor(color);
        if (name && safeColor) snapshot.scriptColorSettings[name] = safeColor;
      });
      ensureTalkIds(snapshot);
      normalizeSceneWallpaperSettings(snapshot);
      await hydrateProjectWallpapersForShare(snapshot);
      return {
        shareId: shareId || project.shareId || generateShareId(),
        title: snapshot.title || '台本',
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
<title>${escapeHtml(payload.title || 'ScriptMaker Viewer')}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f4f6;color:#172033}.app{position:relative;min-height:100dvh;overflow:hidden}.wallpaper{position:fixed;inset:0;background:#f3f4f6 center/cover no-repeat;transition:opacity .45s ease;z-index:0}.wallpaper.next{opacity:0}.header{position:sticky;top:0;z-index:3;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);padding:14px 16px;border-bottom:1px solid rgba(15,23,42,.08)}.label{font-size:12px;color:#64748b;margin:0 0 2px}.title{font-size:19px;margin:0;font-weight:800}.timeline{position:relative;z-index:1;height:calc(100dvh - 62px);overflow:auto;padding:18px 14px 42px}.talk{display:flex;gap:8px;margin:13px 0;align-items:flex-end}.talk.right{justify-content:flex-end}.talk.center{justify-content:center}.avatar{width:44px;height:44px;border-radius:50%;background:#cbd5e1 center/cover no-repeat;flex:0 0 auto;border:2px solid rgba(255,255,255,.85)}.name{font-size:12px;color:#64748b;margin:0 0 3px}.bubble{max-width:min(74vw,520px);padding:11px 14px;border-radius:16px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.08);line-height:1.65;white-space:pre-wrap;word-break:break-word}.right .bubble{background:#dff3ff}.scene .bubble{background:rgba(229,231,235,.94);text-align:center;border-radius:4px;color:#374151;max-width:min(86vw,620px)}.stage{margin-top:6px;padding:7px 10px;border-radius:8px;background:rgba(100,116,139,.18);color:#475569;font-size:12px;line-height:1.5;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid rgba(100,116,139,.18)}.number{display:block;font-size:11px;color:#94a3b8;margin-bottom:2px}.password{position:fixed;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:20px}.password.hidden{display:none}.password-box{width:min(420px,100%);background:#fff;border-radius:12px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,.16)}.password-box input{width:100%;font-size:16px;padding:12px;border:1px solid #cbd5e1;border-radius:8px}.password-box button{margin-top:12px;width:100%;font-size:16px;font-weight:700;padding:12px;border:0;border-radius:8px;background:#2563eb;color:white}.error{color:#b91c1c;font-size:13px;min-height:18px}</style>
</head>
<body>
<div class="app"><div id="wallpaperA" class="wallpaper"></div><div id="wallpaperB" class="wallpaper next"></div><header class="header"><p class="label">ScriptMaker Viewer</p><h1 id="title" class="title"></h1></header><main id="timeline" class="timeline"></main></div>
<div id="passwordGate" class="password hidden"><div class="password-box"><h2>閲覧パスワード</h2><input id="passwordInput" type="password" autocomplete="current-password"><button id="passwordButton">開く</button><p id="passwordError" class="error"></p></div></div>
<script>
let SHARE_PAYLOAD=${data};
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
async function decryptPayload(env,pw){const b=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const m=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveKey"]);const k=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b(env.salt),iterations:env.iter,hash:"SHA-256"},m,{name:"AES-GCM",length:256},false,["decrypt"]);const p=await crypto.subtle.decrypt({name:"AES-GCM",iv:b(env.iv)},k,b(env.ct));return JSON.parse(new TextDecoder().decode(p))}
async function unlockEncrypted(){document.getElementById("passwordGate").classList.remove("hidden");document.getElementById("passwordButton").onclick=async()=>{const error=document.getElementById("passwordError");error.textContent="確認中...";try{SHARE_PAYLOAD=await decryptPayload(SHARE_PAYLOAD.encrypted,document.getElementById("passwordInput").value);error.textContent="";document.getElementById("passwordGate").classList.add("hidden");render()}catch(e){error.textContent="パスワードが違います"}}}
async function unlock(){if(SHARE_PAYLOAD.encrypted){unlockEncrypted();return}const expected=SHARE_PAYLOAD.viewerPasswordHash||"";if(!expected){render();return}document.getElementById("passwordGate").classList.remove("hidden");document.getElementById("passwordButton").onclick=async()=>{const hash=await hashPasswordText(document.getElementById("passwordInput").value);if(hash===expected){document.getElementById("passwordGate").classList.add("hidden");render()}else{document.getElementById("passwordError").textContent="パスワードが違います"}}}
unlock();
</script>
</body>
</html>`;
    }

    // 閲覧パスワードがある場合は、HTMLファイルの中身も暗号化する（ファイルを開いただけでは読めない）
    async function driveViewerBlob(payload) {
      const viewerPassword = document.getElementById('shareViewerPassword')?.value || '';
      let exportPayload = payload;
      if (viewerPassword && window.ScriptMakerShareCrypto && window.crypto?.subtle) {
        exportPayload = { title: '', encrypted: await window.ScriptMakerShareCrypto.encryptJson({ ...payload, viewerPasswordHash: '' }, viewerPassword) };
      }
      return new Blob([buildDriveViewerHtml(exportPayload)], { type: 'text/html;charset=utf-8' });
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
        setShareStatus('Firebaseで共有URLを作成してからViewerを開いてください。', 'error');
        return;
      }
      window.open(url, '_blank');
    }

    async function postShareToWorker(payload, workerUrl) {
      const normalizedWorker = normalizeWorkerUrl(workerUrl);
      if (!normalizedWorker) throw new Error('Cloudflare Worker URLが未設定です。');
      const response = await fetch(normalizedWorker + '/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error('Workerへの保存に失敗しました: ' + response.status + ' ' + detail.slice(0, 160));
      }
      return response.json();
    }

    async function openShareModal() {
      const input = document.getElementById('inputSpeech');
      if (input) input.blur();
      document.body.classList.remove('keyboard-focused');
      const project = state.projects[state.currentProjectId];
      if (!project) {
        alert('共有するプロジェクトがありません。');
        return;
      }
      const passwordInput = document.getElementById('shareViewerPassword');
      if (passwordInput && !passwordInput.value) {
        passwordInput.value = localStorage.getItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY) || '';
      }
      const viewerPassword = passwordInput?.value || '';
      const viewerPasswordHash = viewerPassword ? await hashPasswordText(viewerPassword) : '';
      const isPublished = !!(project.shareId && project.sharePublishedAt);
      pendingSharePayload = await buildViewerSharePayload(project, viewerPasswordHash, project.shareId);
      pendingSharePublished = isPublished;
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      const firebaseInput = document.getElementById('shareFirebaseConfig');
      if (firebaseInput && window.ScriptMakerFirebaseShare) {
        firebaseInput.value = window.ScriptMakerFirebaseShare.configTextForInput();
      }
      if (output) output.value = isPublished ? buildViewerShareUrl(pendingSharePayload) : '';
      if (meta) meta.innerText = (pendingSharePayload.title || '台本') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
      updateShareModalMode(isPublished);
      setShareStatus(isPublished
        ? '公開済みです。台本を変更した場合は「共有データを更新」を押してください。'
        : '初回は「公開URLを作成」を押してください。Firestore保存が成功するまでURLは有効化されません。', '');
      openModal('shareModal');
    }

    function clearStoredSharePassword() {
      localStorage.removeItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY);
      const input = document.getElementById('shareViewerPassword');
      if (input) input.value = '';
      setShareStatus('保存した閲覧パスワードを削除しました。', 'success');
    }

    async function downloadDriveViewerHtml() {
      const payload = ensureSharePayload();
      const blob = await driveViewerBlob(payload);
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
      const file = new File([await driveViewerBlob(payload)], shareFileName(payload), { type: 'text/html' });
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
      await downloadDriveViewerHtml();
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
        setShareStatus('Firebase共有モジュールを読み込めません。', 'error');
        return;
      }
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      const configText = document.getElementById('shareFirebaseConfig')?.value || '';
      const previouslyPublished = !!(project.shareId && project.sharePublishedAt);
      try {
        setShareStatus('Firestoreへ共有データを保存中...', '');
        const viewerPassword = document.getElementById('shareViewerPassword')?.value || '';
        if (viewerPassword) {
          localStorage.setItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY, viewerPassword);
        } else {
          localStorage.removeItem(SCRIPTMAKER_SHARE_VIEWER_PASSWORD_KEY);
        }
        const wasPublished = previouslyPublished;
        const shareId = project.shareId || pendingSharePayload.shareId || generateShareId();
        const shareCreatedAt = project.shareCreatedAt || new Date().toISOString();
        const projectForShare = { ...project, shareId, shareCreatedAt };
        pendingSharePayload = await buildViewerSharePayload(projectForShare, viewerPassword ? await hashPasswordText(viewerPassword) : '', shareId);
        const config = helper.configuredConfig(configText);
        helper.saveConfig(config);
        const stored = await sharePayloadForStorage(pendingSharePayload, viewerPassword);
        await helper.saveShare(stored.payload, config);
        project.shareId = shareId;
        project.shareCreatedAt = shareCreatedAt;
        project.sharePublishedAt = new Date().toISOString();
        saveState();
        const url = buildViewerShareUrl(pendingSharePayload);
        if (output) {
          output.value = url;
          output.classList.remove('hidden');
        }
        updateShareModalMode(true);
        if (meta) meta.innerText = (pendingSharePayload.title || '台本') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
        pendingSharePublished = true;
        const encryptionNote = !viewerPassword ? ''
          : stored.encrypted ? '（パスワードで暗号化して保存しました）'
          : '（閲覧ページが未更新のため、今回は暗号化せずに保存しました）';
        setShareStatus((wasPublished
          ? '共有データを更新しました。このURLで最新版を見られます。'
          : '公開URLを作成しました。次に「公開URLをコピー」を押してください。') + encryptionNote, 'success');
      } catch (error) {
        console.error('Firebase share failed:', error);
        pendingSharePublished = previouslyPublished;
        if (previouslyPublished && output && project.shareId) {
          output.value = buildViewerShareUrl(await buildViewerSharePayload(project, '', project.shareId));
          output.classList.remove('hidden');
          updateShareModalMode(true);
          setShareStatus('共有データの更新に失敗しました。既存URLは前回保存済みの内容のまま開けます。Firestore Rulesを確認してから再度「共有データを更新」を押してください。' + (error.message ? ' ' + error.message : ''), 'error');
        } else {
          if (output) {
            output.value = '';
            output.classList.add('hidden');
          }
          updateShareModalMode(false);
          setShareStatus('共有データの保存に失敗しました。Firestore Rulesを確認してから再度「公開URLを作成」を押してください。' + (error.message ? ' ' + error.message : ''), 'error');
        }
      }
    }

    async function publishWorkerShareUrl() {
      if (!pendingSharePayload) {
        await openShareModal();
        if (!pendingSharePayload) return;
      }
      const workerUrl = configuredWorkerUrl();
      if (!workerUrl) {
        setShareStatus('Cloudflare Worker URLが未設定です。', 'error');
        return;
      }
      localStorage.setItem(SCRIPTMAKER_SHARE_WORKER_URL_KEY, workerUrl);
      const output = document.getElementById('shareUrlText');
      const meta = document.getElementById('shareMetaText');
      try {
        setShareStatus('Workerへ共有データを保存中...', '');
        const result = await postShareToWorker(pendingSharePayload, workerUrl);
        if (result?.id) pendingSharePayload.shareId = result.id;
        const url = buildViewerShareUrl(pendingSharePayload, workerUrl);
        if (output) output.value = url;
        if (meta) meta.innerText = (pendingSharePayload.title || '台本') + ' / ' + pendingSharePayload.project.talks.length + '\u4ef6 / id: ' + pendingSharePayload.shareId;
        pendingSharePublished = true;
        setShareStatus('共有URLを作成しました。', 'success');
      } catch (error) {
        console.error('Worker share failed:', error);
        setShareStatus(error.message + ' JSONダウンロード方式をバックアップとして利用できます。', 'error');
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
      setShareStatus('JSONをダウンロードしました。Share/data/ に追加するとViewerで開けます。', 'success');
    }

    async function recreateProjectShareUrl() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      if (!confirm('新しい公開URLを作り直しますか？旧URLはそのまま残りますが、今後の更新は新URL側に反映されます。')) return;
      project.shareId = generateShareId();
      project.shareCreatedAt = new Date().toISOString();
      delete project.sharePublishedAt;
      saveState();
      const viewerPassword = document.getElementById('shareViewerPassword')?.value || '';
      pendingSharePayload = await buildViewerSharePayload(project, viewerPassword ? await hashPasswordText(viewerPassword) : '', project.shareId);
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
        setShareStatus('Firebase configを設定して共有URLを作成してください。コピーできない場合はURLを長押ししてコピーしてください。', 'error');
        return;
      }
      const ok = await tryClipboardCopy(value);
      if (ok) {
        setShareStatus('共有URLをコピーしました。', 'success');
        return;
      }
      selectShareUrl();
      setShareStatus('コピーできませんでした。URLを長押ししてコピーしてください。', 'error');
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
