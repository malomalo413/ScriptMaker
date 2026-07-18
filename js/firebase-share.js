(function() {
  const FIREBASE_SDK_VERSION = "10.12.5";
  const FIREBASE_CONFIG_STORAGE_KEY = "scriptmaker_firebase_config_v1";
  const FIREBASE_SHARE_COLLECTION = "scriptShares";
  const FIREBASE_EDITOR_PROJECT_COLLECTION = "editorProjects";
  const FIREBASE_EDITOR_ACCOUNT_COLLECTION = "editorAccounts";
  const FIREBASE_EDITOR_ACCOUNT_STATE_ID = "main";
  const FIREBASE_CHUNK_SIZE = 650000;

  let modulesPromise = null;
  const appCache = new Map();

  function firebaseConfigFromGlobal() {
    return window.SCRIPTMAKER_FIREBASE_CONFIG || {};
  }

  function parseFirebaseConfigText(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      const match = raw.match(/firebaseConfig\s*=\s*({[\s\S]*?})\s*;?\s*$/);
      const objectSource = match ? match[1] : raw;
      try {
        return Function('"use strict"; return (' + objectSource + ');')();
      } catch (error) {
        throw new Error("Firebase configを読み取れません。Firebaseの設定オブジェクトを貼り付けてください。");
      }
    }
  }

  function cleanConfig(config) {
    const source = config || {};
    return {
      apiKey: source.apiKey || "",
      authDomain: source.authDomain || "",
      projectId: source.projectId || "",
      storageBucket: source.storageBucket || "",
      messagingSenderId: source.messagingSenderId || "",
      appId: source.appId || "",
      measurementId: source.measurementId || ""
    };
  }

  function isConfigured(config) {
    return !!(config && config.apiKey && config.projectId && config.appId);
  }

  function savedConfig() {
    try {
      return cleanConfig(JSON.parse(localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY) || "null"));
    } catch (_) {
      return {};
    }
  }

  function configuredConfig(inputValue) {
    const parsed = parseFirebaseConfigText(inputValue || "");
    const stored = savedConfig();
    const globalConfig = cleanConfig(firebaseConfigFromGlobal());
    const source = parsed || (isConfigured(stored) ? stored : globalConfig);
    const config = cleanConfig(source);
    if (!isConfigured(config)) {
      throw new Error("Firebase configが未設定です。共有画面にFirebase configを入力するか、js/firebase-config.jsに設定してください。");
    }
    return config;
  }

  function saveConfig(config) {
    const cleaned = cleanConfig(config);
    if (isConfigured(cleaned)) {
      localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  }

  function configTextForInput() {
    const config = savedConfig();
    const fallback = isConfigured(config) ? config : cleanConfig(firebaseConfigFromGlobal());
    return isConfigured(fallback) ? JSON.stringify(fallback, null, 2) : "";
  }

  async function modules() {
    if (!modulesPromise) {
      modulesPromise = Promise.all([
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-firestore.js"),
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-auth.js")
      ]).then(([app, firestore, auth]) => ({ app, firestore, auth }));
    }
    return modulesPromise;
  }

  async function appContextForConfig(config) {
    const cleaned = cleanConfig(config);
    const key = cleaned.projectId + ":" + cleaned.appId;
    if (appCache.has(key)) return appCache.get(key);
    const { app, firestore, auth } = await modules();
    const appName = "scriptmaker-share-" + key.replace(/[^a-zA-Z0-9_-]/g, "_");
    let firebaseApp;
    try {
      firebaseApp = app.initializeApp(cleaned, appName);
    } catch (_) {
      firebaseApp = app.getApp(appName);
    }
    const db = firestore.getFirestore(firebaseApp);
    const authInstance = auth.getAuth(firebaseApp);
    const context = { app: firebaseApp, db, auth: authInstance };
    appCache.set(key, context);
    return context;
  }

  async function dbForConfig(config) {
    return (await appContextForConfig(config)).db;
  }

  async function authForConfig(config) {
    return (await appContextForConfig(config)).auth;
  }

  function firebaseAuthHost(config) {
    const cleaned = cleanConfig(config || configuredConfig(""));
    return cleaned.authDomain || (cleaned.projectId ? cleaned.projectId + ".firebaseapp.com" : "");
  }

  function currentHost() {
    return String(location.hostname || "").toLowerCase();
  }

  function shouldAllowRedirectFallback(config) {
    const host = currentHost();
    const authHost = firebaseAuthHost(config).toLowerCase();
    if (!host || !authHost) return false;
    return host === authHost || host.endsWith(".firebaseapp.com") || host.endsWith(".web.app");
  }

  function chunksForPayload(payload) {
    const json = JSON.stringify(payload);
    const chunks = [];
    for (let i = 0; i < json.length; i += FIREBASE_CHUNK_SIZE) {
      chunks.push(json.slice(i, i + FIREBASE_CHUNK_SIZE));
    }
    return chunks;
  }

  async function saveChunkedPayload(collectionName, documentId, payload, config) {
    if (!collectionName || !documentId || !payload) throw new Error("保存するデータがありません。");
    const db = await dbForConfig(config);
    const { doc, collection, setDoc, writeBatch, serverTimestamp } = (await modules()).firestore;
    const rootRef = doc(db, collectionName, documentId);
    const chunks = chunksForPayload(payload);
    const meta = {
      id: documentId,
      title: payload.title || "",
      chunkCount: chunks.length,
      schemaVersion: payload.schemaVersion || 1,
      createdAt: payload.createdAt || serverTimestamp(),
      updatedAt: payload.updatedAt || serverTimestamp()
    };
    if (chunks.length === 1 && chunks[0].length <= FIREBASE_CHUNK_SIZE) {
      meta.data = chunks[0];
    }

    if (chunks.length <= 450) {
      const batch = writeBatch(db);
      batch.set(rootRef, meta);
      chunks.forEach((data, index) => {
        const chunkId = String(index).padStart(4, "0");
        batch.set(doc(collection(rootRef, "chunks"), chunkId), { index, data });
      });
      await batch.commit();
      return documentId;
    }

    await setDoc(rootRef, meta);
    await Promise.all(chunks.map((data, index) => {
      const chunkId = String(index).padStart(4, "0");
      return setDoc(doc(collection(rootRef, "chunks"), chunkId), { index, data });
    }));
    return documentId;
  }

  async function loadChunkedPayload(collectionName, documentId, config) {
    if (!documentId) return null;
    const db = await dbForConfig(config || configuredConfig(""));
    const { doc, collection, getDoc, getDocs, query, orderBy } = (await modules()).firestore;
    const rootRef = doc(db, collectionName, documentId);
    const rootSnap = await getDoc(rootRef);
    if (!rootSnap.exists()) return null;
    const root = rootSnap.data();
    if (root.payload) return root.payload;
    if (root.data && typeof root.data === "string") return JSON.parse(root.data);
    const chunkQuery = query(collection(rootRef, "chunks"), orderBy("index", "asc"));
    const chunkSnap = await getDocs(chunkQuery);
    if (chunkSnap.empty) return null;
    const docs = Number.isFinite(root.chunkCount) ? chunkSnap.docs.slice(0, root.chunkCount) : chunkSnap.docs;
    const json = docs.map(item => item.data().data || "").join("");
    return JSON.parse(json);
  }

  async function saveShare(payload, config) {
    if (!payload || !payload.shareId) throw new Error("共有データがありません。");
    return saveChunkedPayload(FIREBASE_SHARE_COLLECTION, payload.shareId, payload, config);
  }

  async function loadShare(shareId, config) {
    return loadChunkedPayload(FIREBASE_SHARE_COLLECTION, shareId, config);
  }

  async function saveEditorProject(payload, config) {
    if (!payload || !payload.id) throw new Error("クラウドプロジェクトがありません。");
    return saveChunkedPayload(FIREBASE_EDITOR_PROJECT_COLLECTION, payload.id, payload, config);
  }

  async function loadEditorProject(projectId, config) {
    return loadChunkedPayload(FIREBASE_EDITOR_PROJECT_COLLECTION, projectId, config);
  }

  function editorAccountStateCollection(uid) {
    if (!uid) throw new Error("Googleログインが必要です。");
    return FIREBASE_EDITOR_ACCOUNT_COLLECTION + "/" + uid + "/editorStates";
  }

  async function saveEditorAccountState(uid, payload, config) {
    if (!payload) throw new Error("同期するEditorデータがありません。");
    const next = { ...payload, id: FIREBASE_EDITOR_ACCOUNT_STATE_ID };
    return saveChunkedPayload(editorAccountStateCollection(uid), FIREBASE_EDITOR_ACCOUNT_STATE_ID, next, config);
  }

  async function loadEditorAccountState(uid, config) {
    return loadChunkedPayload(editorAccountStateCollection(uid), FIREBASE_EDITOR_ACCOUNT_STATE_ID, config);
  }

  async function signInEditorWithGoogle(config, options) {
    const cleaned = configuredConfig(config || "");
    const { auth } = await modules();
    const authInstance = await authForConfig(cleaned);
    const provider = new auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    authInstance.useDeviceLanguage?.();
    const allowRedirectFallback = !!options?.allowRedirectFallback && shouldAllowRedirectFallback(cleaned);
    try {
      const result = await auth.signInWithPopup(authInstance, provider);
      return result.user;
    } catch (error) {
      const code = String(error?.code || "");
      if (allowRedirectFallback && (code.includes("popup") || code.includes("operation-not-supported"))) {
        await auth.signInWithRedirect(authInstance, provider);
        return null;
      }
      if (code.includes("popup")) {
        throw new Error("Googleログインのポップアップを開けませんでした。ブラウザのポップアップ許可を有効にするか、外部ブラウザで開いてください。");
      }
      throw error;
    }
  }

  async function consumeEditorRedirectResult(config) {
    const authInstance = await authForConfig(configuredConfig(config || ""));
    const { auth } = await modules();
    const result = await auth.getRedirectResult(authInstance);
    return result?.user || null;
  }

  async function signOutEditor(config) {
    const authInstance = await authForConfig(configuredConfig(config || ""));
    const { auth } = await modules();
    await auth.signOut(authInstance);
  }

  async function onEditorAuthChanged(callback, config) {
    const authInstance = await authForConfig(configuredConfig(config || ""));
    const { auth } = await modules();
    return auth.onAuthStateChanged(authInstance, callback);
  }

  async function currentEditorUser(config) {
    const authInstance = await authForConfig(configuredConfig(config || ""));
    return authInstance.currentUser || null;
  }

  window.ScriptMakerFirebaseShare = {
    FIREBASE_CONFIG_STORAGE_KEY,
    parseFirebaseConfigText,
    cleanConfig,
    configuredConfig,
    configTextForInput,
    saveConfig,
    saveShare,
    loadShare,
    saveEditorProject,
    loadEditorProject,
    saveEditorAccountState,
    loadEditorAccountState,
    signInEditorWithGoogle,
    consumeEditorRedirectResult,
    signOutEditor,
    onEditorAuthChanged,
    currentEditorUser,
    isConfigured
  };
})();
