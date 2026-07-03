(function() {
  const FIREBASE_SDK_VERSION = "10.12.5";
  const FIREBASE_CONFIG_STORAGE_KEY = "scriptmaker_firebase_config_v1";
  const FIREBASE_COLLECTION = "scriptShares";
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
    const config = cleanConfig(parsed || savedConfig() || firebaseConfigFromGlobal());
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
        import("https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/firebase-firestore.js")
      ]).then(([app, firestore]) => ({ app, firestore }));
    }
    return modulesPromise;
  }

  async function dbForConfig(config) {
    const cleaned = cleanConfig(config);
    const key = cleaned.projectId + ":" + cleaned.appId;
    if (appCache.has(key)) return appCache.get(key);
    const { app, firestore } = await modules();
    const appName = "scriptmaker-share-" + key.replace(/[^a-zA-Z0-9_-]/g, "_");
    let firebaseApp;
    try {
      firebaseApp = app.initializeApp(cleaned, appName);
    } catch (_) {
      firebaseApp = app.getApp(appName);
    }
    const db = firestore.getFirestore(firebaseApp);
    appCache.set(key, db);
    return db;
  }

  function chunksForPayload(payload) {
    const json = JSON.stringify(payload);
    const chunks = [];
    for (let i = 0; i < json.length; i += FIREBASE_CHUNK_SIZE) {
      chunks.push(json.slice(i, i + FIREBASE_CHUNK_SIZE));
    }
    return chunks;
  }

  async function saveShare(payload, config) {
    if (!payload || !payload.shareId) throw new Error("共有データがありません。");
    const db = await dbForConfig(config);
    const { doc, collection, setDoc, writeBatch, serverTimestamp } = (await modules()).firestore;
    const rootRef = doc(db, FIREBASE_COLLECTION, payload.shareId);
    const chunks = chunksForPayload(payload);
    const meta = {
      id: payload.shareId,
      title: payload.title || "",
      chunkCount: chunks.length,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (chunks.length <= 450) {
      const batch = writeBatch(db);
      batch.set(rootRef, meta);
      chunks.forEach((data, index) => {
        const chunkId = String(index).padStart(4, "0");
        batch.set(doc(collection(rootRef, "chunks"), chunkId), { index, data });
      });
      await batch.commit();
      return payload.shareId;
    }

    await setDoc(rootRef, meta);
    await Promise.all(chunks.map((data, index) => {
      const chunkId = String(index).padStart(4, "0");
      return setDoc(doc(collection(rootRef, "chunks"), chunkId), { index, data });
    }));
    return payload.shareId;
  }

  async function loadShare(shareId, config) {
    if (!shareId) return null;
    const db = await dbForConfig(config || configuredConfig(""));
    const { doc, collection, getDoc, getDocs, query, orderBy } = (await modules()).firestore;
    const rootRef = doc(db, FIREBASE_COLLECTION, shareId);
    const rootSnap = await getDoc(rootRef);
    if (!rootSnap.exists()) return null;
    const root = rootSnap.data();
    if (root.payload) return root.payload;
    const chunkQuery = query(collection(rootRef, "chunks"), orderBy("index", "asc"));
    const chunkSnap = await getDocs(chunkQuery);
    if (chunkSnap.empty) return null;
    const json = chunkSnap.docs.map(item => item.data().data || "").join("");
    return JSON.parse(json);
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
    isConfigured
  };
})();
