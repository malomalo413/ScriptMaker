// パスワード付き共有の暗号化（Editor と Viewer で共通）
// Viewer/js/share-crypto.js はこのファイルのコピーです。変更するときは両方を同じ内容にしてください。
//
// パスワードから PBKDF2-SHA256 で鍵を作り、AES-GCM で台本データ全体を暗号化します。
// Firestore には暗号文しか保存されないため、パスワードを知らない人はデータを読めません。
(function() {
  const PBKDF2_ITERATIONS = 310000;
  const ENVELOPE_VERSION = 1;

  function bytesToBase64(bytes) {
    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  async function deriveKey(password, salt, iterations, extractable) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(password || "")), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      !!extractable,
      ["encrypt", "decrypt"]
    );
  }

  function isEnvelope(value) {
    return !!(value && typeof value === "object" && value.alg === "AES-GCM" && value.ct && value.iv && value.salt);
  }

  async function encryptJson(value, password) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(password, salt, PBKDF2_ITERATIONS, false);
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
    return {
      v: ENVELOPE_VERSION,
      alg: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iter: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(cipher)
    };
  }

  async function decryptWithKey(envelope, key) {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // 成功すると { value, rawKey } を返す。rawKey は「この端末にパスワードを保存」用（この共有専用の鍵）。
  // パスワードが違う場合は null を返す。
  async function decryptJson(envelope, password) {
    if (!isEnvelope(envelope)) throw new Error("暗号化データの形式が正しくありません。");
    const key = await deriveKey(password, base64ToBytes(envelope.salt), Number(envelope.iter) || PBKDF2_ITERATIONS, true);
    try {
      const value = await decryptWithKey(envelope, key);
      const rawKey = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
      return { value, rawKey };
    } catch (_) {
      return null;
    }
  }

  async function decryptJsonWithRawKey(envelope, rawKey) {
    if (!isEnvelope(envelope) || !rawKey) return null;
    try {
      const key = await crypto.subtle.importKey("raw", base64ToBytes(rawKey), { name: "AES-GCM" }, false, ["decrypt"]);
      return await decryptWithKey(envelope, key);
    } catch (_) {
      return null;
    }
  }

  // 推測されにくいランダムID（共有IDなど）
  function randomId(prefix) {
    const bytes = randomBytes(16);
    const text = bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return (prefix || "") + text;
  }

  window.ScriptMakerShareCrypto = {
    encryptJson,
    decryptJson,
    decryptJsonWithRawKey,
    isEnvelope,
    randomId,
    bytesToBase64,
    base64ToBytes
  };
})();
