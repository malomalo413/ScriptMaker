// ScriptMaker 自動テスト（ブラウザで tests/index.html を開くと実行される）
// アプリの起動処理（データ読み込み・パスワード画面）は動かさず、関数単位で動作を確認する。
window.onload = null;
initEditorAuthGate = function() {};

const testCases = [];
function test(name, fn) { testCases.push({ name, fn }); }
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed'); }
function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((message ? message + ': ' : '') + 'expected ' + e + ' but got ' + a);
}

function sampleProject(count) {
  return {
    title: 'テスト',
    characters: [{ name: '太郎' }, { name: '花子' }],
    talks: Array.from({ length: count }, (_, i) => ({ id: 'talk_' + i, charName: i % 2 ? '花子' : '太郎', text: 'セリフ' + (i + 1) }))
  };
}

// ---- 共有の暗号化 ----
test('暗号化した共有データは正しいパスワードで元に戻せる', async () => {
  const data = { title: '台本', project: sampleProject(3) };
  const envelope = await ScriptMakerShareCrypto.encryptJson(data, 'secret-pass');
  assert(!JSON.stringify(envelope).includes('セリフ1'), '暗号文に平文が含まれている');
  const result = await ScriptMakerShareCrypto.decryptJson(envelope, 'secret-pass');
  assertEqual(result.value, data);
  assert(result.rawKey, '保存用の鍵が返っていない');
});

test('間違ったパスワードでは復号できない', async () => {
  const envelope = await ScriptMakerShareCrypto.encryptJson({ a: 1 }, 'right');
  assertEqual(await ScriptMakerShareCrypto.decryptJson(envelope, 'wrong'), null);
});

test('保存した鍵で再度復号できる（パスワードを毎回入力しなくてよい）', async () => {
  const envelope = await ScriptMakerShareCrypto.encryptJson({ a: 2 }, 'pw');
  const { rawKey } = await ScriptMakerShareCrypto.decryptJson(envelope, 'pw');
  assertEqual(await ScriptMakerShareCrypto.decryptJsonWithRawKey(envelope, rawKey), { a: 2 });
  assertEqual(await ScriptMakerShareCrypto.decryptJsonWithRawKey(envelope, 'AAAA'), null);
});

test('同じ内容でも暗号化するたびに結果が変わる（ソルトとIVがランダム）', async () => {
  const a = await ScriptMakerShareCrypto.encryptJson({ x: 1 }, 'pw');
  const b = await ScriptMakerShareCrypto.encryptJson({ x: 1 }, 'pw');
  assert(a.ct !== b.ct && a.salt !== b.salt && a.iv !== b.iv);
});

test('共有IDは推測されにくく、Viewerが読み取れる形式', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const id = generateShareId();
    assert(/^share_[A-Za-z0-9_-]{20,}$/.test(id), '形式が不正: ' + id);
    ids.add(id);
  }
  assertEqual(ids.size, 200, 'IDが重複した');
});

test('Viewer用の暗号化ファイルはEditor用と同じ内容', async () => {
  const [editor, viewer] = await Promise.all([
    fetch('../js/share-crypto.js', { cache: 'no-store' }).then(r => r.text()),
    fetch('../Viewer/js/share-crypto.js', { cache: 'no-store' }).then(r => r.text())
  ]);
  assert(editor.replace(/\r\n/g, '\n') === viewer.replace(/\r\n/g, '\n'), 'js/share-crypto.js と Viewer/js/share-crypto.js が異なる');
});

// ---- 起動パスワード ----
test('起動パスワードはソルト付きPBKDF2で保存され、照合できる', async () => {
  const hash = await createEditorPasswordHash('my-password');
  assert(hash.startsWith('pbkdf2$'), '新形式になっていない');
  assert(!hash.includes('my-password'));
  assert(await verifyEditorPassword('my-password', hash));
  assert(!(await verifyEditorPassword('other', hash)));
  const again = await createEditorPasswordHash('my-password');
  assert(hash !== again, 'ソルトが毎回変わっていない');
});

test('旧形式（SHA-256）のパスワードも照合できる', async () => {
  const legacy = await hashPasswordText('old-pass');
  assert(legacy.startsWith('sha256:'));
  assert(await verifyEditorPassword('old-pass', legacy));
  assert(!(await verifyEditorPassword('nope', legacy)));
});

// ---- データ ----
test('保存データにバージョン番号が付く', () => {
  state = { projects: {} };
  normalizeProjectData();
  assertEqual(state.schemaVersion, SCRIPTMAKER_DATA_SCHEMA_VERSION);
});

test('古い「開始・終了番号」形式のシーン壁紙はトークIDに変換される', () => {
  const project = sampleProject(6);
  const scene = normalizeSceneWallpaper({ name: 'A', start: 2, end: 4 }, 0, project);
  assertEqual(scene.talkIds, ['talk_1', 'talk_2', 'talk_3']);
});

test('1つのトークは1つのシーンにしか属さない', () => {
  const scenes = [{ id: 'a', talkIds: ['t1', 't2'] }, { id: 'b', talkIds: ['t2', 't3'] }];
  enforceUniqueSceneTalkSelections(scenes);
  assertEqual(scenes[0].talkIds, ['t1']);
  assertEqual(scenes[1].talkIds, ['t2', 't3']);
});

test('範囲指定の壁紙：最初と最後に選んだトークの間がすべて対象になる', () => {
  state = { projects: { p: sampleProject(10) }, currentProjectId: 'p' };
  selectedTalkIndexes.clear();
  selectedTalkIndexes.add(7);
  selectedTalkIndexes.add(2);
  const range = getSelectedTalkRange();
  assertEqual([range.start, range.end], [2, 7]);
  assertEqual(range.talkIds, ['talk_2', 'talk_3', 'talk_4', 'talk_5', 'talk_6', 'talk_7']);
  selectedTalkIndexes.clear();
  assertEqual(getSelectedTalkRange(), null);
});

test('共有データにト書き（stageDirection）がそのまま入る', async () => {
  const project = sampleProject(3);
  project.talks[0].stageDirection = '残念';
  project.talks[2].note = '旧形式のト書き';
  state = { projects: { p: project }, currentProjectId: 'p' };
  const payload = await buildViewerSharePayload(project, '', 'share_test');
  const talks = JSON.parse(JSON.stringify(payload)).project.talks;
  assertEqual(talks.map(t => [t.id, t.charName, t.text]), project.talks.map(t => [t.id, t.charName, t.text]));
  assertEqual(talks[0].stageDirection, '残念');
  assertEqual(talks[2].note, '旧形式のト書き');
});

test('ト書きを変えると「共有データが古い」と判定され、記録後は最新になる', async () => {
  const project = sampleProject(2);
  state = { projects: { p: project }, currentProjectId: 'p' };
  project.shareId = 'share_x';
  project.sharePublishedAt = new Date().toISOString();
  assert(await isShareOutdated(project), '記録がない古い共有は「古い」とみなす');
  project.shareContentHash = await shareContentFingerprint(project);
  assert(!(await isShareOutdated(project)), '記録直後は最新');
  project.updatedAt = 'changed'; project.revision = 99;
  assert(!(await isShareOutdated(project)), '管理用の項目だけの変更では古くならない');
  project.talks[1].stageDirection = '笑いながら';
  assert(await isShareOutdated(project), 'ト書きの変更で古くなる');
});

test('番号表示とHTMLエスケープ', () => {
  assertEqual(formatTalkNumber(0), '001');
  assertEqual(formatTalkNumber(41), '042');
  assertEqual(escapeHtml('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
});

// ---- リンクからの台本取り込み ----
function encodeBase64UrlText(text) {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('取り込みリンクから題名と行を読み取れる', () => {
  const text = 'さくら：おはよう！（手を振る）\n\n情景描写：朝の教室。\nこれは解析できない行';
  const url = 'https://example.com/Editor/#import=' + encodeBase64UrlText(text) + '&title=' + encodeURIComponent('8話');
  const result = readScriptImportFromUrl(url);
  assertEqual(result.title, '8話');
  assertEqual(result.parsed.map(row => row.charName), ['さくら', '情景描写']);
  assertEqual(result.parsed[0].text, 'おはよう！（手を振る）');
  assertEqual(result.rejected.length, 1);
});

test('取り込みリンクがない・壊れている・長すぎる場合', () => {
  assertEqual(readScriptImportFromUrl('https://example.com/Editor/'), null);
  assert(readScriptImportFromUrl('https://example.com/Editor/#import=%%%').error, '壊れたデータでエラーにならない');
  assert(readScriptImportFromUrl('https://example.com/Editor/#import=' + 'A'.repeat(70000)).error.includes('長すぎ'), '長さ上限でエラーにならない');
  assertEqual(readScriptImportFromUrl('https://example.com/Editor/#import=' + encodeBase64UrlText('さくら：やあ')).title, '取り込み台本');
});

// ---- 壁紙画像の同期 ----
test('手元の壁紙画像は同期スペースへ送り、手元にない画像は受け取って保存する', async () => {
  const saved = {};
  const localId = 'img_test_local_' + Date.now();
  const remoteId = 'img_test_remote_' + Date.now();
  const remoteBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
  await putStoredImage({ id: localId, blob: new Blob([new Uint8Array([9, 8])], { type: 'image/webp' }), type: 'image/webp' });
  const originals = { state, editorBackupMeta, editorBackupFirebaseConfig, helper: window.ScriptMakerFirebaseShare, uploaded: localStorage.getItem(SCRIPTMAKER_WALLPAPER_SYNC_UPLOADED_KEY) };
  try {
    state = { projects: { p1: { wallpaper: { imageId: localId }, sceneWallpaperSettings: { enabled: true, scenes: [{ id: 's1', imageId: remoteId, imageUrl: 'blob:other-device', talkIds: [] }] } } } };
    editorBackupMeta = () => ({ syncSpaceId: 'space_test' });
    editorBackupFirebaseConfig = async () => ({});
    window.ScriptMakerFirebaseShare = {
      saveEditorSyncImage: async (space, id, payload) => { saved[id] = payload; },
      loadEditorSyncImage: async (space, id) => id === remoteId ? { dataUrl: await blobToDataUrl(remoteBlob), type: 'image/webp' } : null
    };
    await syncWallpaperImagesNow();
    assert(saved[localId]?.dataUrl?.startsWith('data:image/webp'), '手元の画像が送られていない');
    assert(!saved[remoteId], '手元にない画像を送ろうとした');
    const record = await getStoredImage(remoteId);
    assertEqual(record?.blob?.size, 3, '受け取った画像が保存されていない');
    assert(!state.projects.p1.sceneWallpaperSettings.scenes[0].imageUrl, '別端末の blob: URL が残っている');
    await syncWallpaperImagesNow();
    assertEqual(Object.keys(saved).length, 1, '送信済みの画像をもう一度送った');
  } finally {
    state = originals.state;
    editorBackupMeta = originals.editorBackupMeta;
    editorBackupFirebaseConfig = originals.editorBackupFirebaseConfig;
    window.ScriptMakerFirebaseShare = originals.helper;
    if (originals.uploaded == null) localStorage.removeItem(SCRIPTMAKER_WALLPAPER_SYNC_UPLOADED_KEY);
    else localStorage.setItem(SCRIPTMAKER_WALLPAPER_SYNC_UPLOADED_KEY, originals.uploaded);
  }
});

// ---- キャラのアイコン画像 ----
function sampleAvatarDataUrl(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0, 0, 64, 64);
  return canvas.toDataURL('image/jpeg', 0.9);
}

async function withAvatarTestState(fn) {
  const originals = { state, library: localStorage.getItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY), scheduleEditorBackupSync };
  scheduleEditorBackupSync = () => {};
  try {
    localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, '[]');
    await fn();
  } finally {
    state = originals.state;
    scheduleEditorBackupSync = originals.scheduleEditorBackupSync;
    if (originals.library == null) localStorage.removeItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY);
    else localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, originals.library);
  }
}

test('アイコン画像は1回だけ保存され、プロジェクトには画像IDだけが残る', async () => withAvatarTestState(async () => {
  const sakura = sampleAvatarDataUrl('#f472b6');
  const taku = sampleAvatarDataUrl('#38bdf8');
  const p1 = sampleProject(2); const p2 = sampleProject(2);
  p1.characters = [{ name: 'さくら', avatar: sakura }, { name: 'たく', avatar: taku }];
  p2.characters = [{ name: 'さくら', avatar: sakura }, { name: 'さくら・たく', avatar: sakura }];
  p2.talks[0].characterSnapshot = { name: '退場キャラ', avatar: taku };
  state = { projects: { p1, p2 }, currentProjectId: 'p1' };
  localStorage.setItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY, JSON.stringify([{ name: 'さくら', avatar: sakura }]));

  assert(await migrateAvatarsToIndexedDB(), '移し替えが行われていない');
  const ids = [p1.characters[0], p2.characters[0], p2.characters[1]].map(c => c.avatarImageId);
  assert(ids[0] && ids.every(id => id === ids[0]), '同じ画像が同じIDにまとまっていない');
  assert(p1.characters[1].avatarImageId && p1.characters[1].avatarImageId !== ids[0], '別の画像が別のIDになっていない');
  assertEqual(p2.talks[0].characterSnapshot.avatarImageId, p1.characters[1].avatarImageId, 'セリフに残したキャラも移し替える');
  assert(stateCharacterRecords().every(c => !c.avatar), 'data: URL が残っている');
  assert(!JSON.stringify(cloneStateForLocalStorage()).includes('data:image'), '保存データに画像が入っている');
  const library = JSON.parse(localStorage.getItem(SCRIPTMAKER_CHARACTER_LIBRARY_KEY));
  assertEqual(library[0].avatarImageId, ids[0], 'ライブラリも画像IDになる');
  assert(!JSON.stringify(library).includes('data:image'), 'ライブラリに画像が入っている');
  assert(avatarDisplayUrl(p1.characters[0]).startsWith('blob:'), '表示用URLが用意されていない');
  assert(!(await migrateAvatarsToIndexedDB()), '2回目は何も変わらないはず');
}));

test('共有・書き出しでは画像IDのアイコンを data: URL に戻す', async () => withAvatarTestState(async () => {
  const sakura = sampleAvatarDataUrl('#a3e635');
  const project = sampleProject(1);
  project.characters = [{ name: 'さくら', avatar: sakura, isProtagonist: true }];
  state = { projects: { p: project }, currentProjectId: 'p' };
  await migrateAvatarsToIndexedDB();
  assert(project.characters[0].avatarImageId);
  const payload = await buildViewerSharePayload(project, '', 'share_avatar_test');
  assertEqual(payload.project.characters[0].avatar, sakura, '共有データのアイコンが元の画像と違う');
  assert(!payload.project.characters[0].avatarImageId, '共有データに画像IDが残っている');
  assert(project.characters[0].avatarImageId && !project.characters[0].avatar, '元のプロジェクトを書き換えてしまった');
  const cloud = await buildEditorCloudPayload(project, 'cloud_test');
  assertEqual(cloud.data.characters[0].avatar, sakura, 'クラウド保存のアイコンが元の画像と違う');
}));

test('キャラ編集・ライブラリ・セリフのスナップショットで画像IDが引き継がれる', () => {
  const character = { name: 'たく', avatar: '', avatarImageId: 'avatar_abc', isRound: true, zoom: 120 };
  assertEqual(characterSnapshot(character).avatarImageId, 'avatar_abc');
  assertEqual(cloneLibraryCharacterForProject(character, false).avatarImageId, 'avatar_abc');
  assertEqual(normalizeLibraryCharacter(character).avatarImageId, 'avatar_abc');
  assert(characterLibrarySignature(character).endsWith('avatar_abc'), 'ライブラリの同一判定に画像IDを使う');
  const replaced = setCharacterAvatarFields({ ...character }, 'data:image/jpeg;base64,AAAA', '');
  assert(replaced.avatar.startsWith('data:') && !replaced.avatarImageId, '新しい画像を選んだら画像IDは外す');
});

// ---- 実行 ----
window.addEventListener('load', async () => {
  const list = document.getElementById('results');
  let passed = 0;
  for (const { name, fn } of testCases) {
    const item = document.createElement('li');
    try {
      await fn();
      passed++;
      item.className = 'pass';
      item.textContent = '✓ ' + name;
    } catch (error) {
      item.className = 'fail';
      item.textContent = '✗ ' + name;
      const detail = document.createElement('pre');
      detail.textContent = error && error.message ? error.message : String(error);
      item.appendChild(detail);
    }
    list.appendChild(item);
  }
  const summary = document.getElementById('summary');
  const ok = passed === testCases.length;
  summary.className = ok ? 'pass' : 'fail';
  summary.textContent = (ok ? '合格' : '不合格') + '：' + passed + ' / ' + testCases.length + ' 件';
  document.title = (ok ? 'PASS ' : 'FAIL ') + passed + '/' + testCases.length;
  window.__testResult = { passed, total: testCases.length };
});
