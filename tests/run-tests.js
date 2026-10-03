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

test('番号表示とHTMLエスケープ', () => {
  assertEqual(formatTalkNumber(0), '001');
  assertEqual(formatTalkNumber(41), '042');
  assertEqual(escapeHtml('<b>"A&B"</b>'), '&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;');
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
