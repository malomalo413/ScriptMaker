// ScriptMaker Editor — 壁紙・シーン壁紙・範囲指定の壁紙
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    function openWallpaperModal() {
      const project = state.projects[state.currentProjectId];
      const wallpaper = project?.wallpaper || {};
      const sceneSettings = getSceneWallpaperSettings(project);

      selectedWallpaperBase64 = wallpaper.image || wallpaper.imageUrl || "";
      selectedWallpaperImageId = wallpaper.imageId || "";
      wallpaperSize = Math.max(100, wallpaper.size || 100);
      wallpaperOffsetX = wallpaper.offsetX ?? 50;
      wallpaperOffsetY = wallpaper.offsetY ?? 50;
      wallpaperPanStart = null;
      wallpaperPanOffset = null;

      document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundImage = selectedWallpaperBase64 ? 'url(' + selectedWallpaperBase64 + ')' : "";
      preview.classList.toggle('has-image', !!selectedWallpaperBase64);
      resolveWallpaperUrl(wallpaper).then(url => {
        selectedWallpaperBase64 = url || selectedWallpaperBase64;
        preview.style.backgroundImage = url ? 'url(' + url + ')' : "";
        preview.classList.toggle('has-image', !!url);
      });
      editingSceneWallpapers = (sceneSettings.scenes || []).map((scene, index) => normalizeSceneWallpaper(scene, index, project)).filter(Boolean);
      activeSceneWallpaperId = editingSceneWallpapers[0]?.id || "";
      const toggle = document.getElementById('sceneWallpaperToggle');
      if (toggle) toggle.checked = !!sceneSettings.enabled;
      updateWallpaperPreviewStyle();
      renderSceneWallpaperList();
      toggleSceneWallpaperControls();
      sceneRangeAnchor = null;
      setWallpaperSaveStatus('');
      savedWallpaperEditorSnapshot = wallpaperEditorSnapshot();
      openModal('wallpaperModal');
      initWallpaperDropArea();
    }

    async function setMainWallpaperFile(file) {
      if (!file) return;

      try {
        const stored = await storeWallpaperFile(file);
        selectedWallpaperImageId = stored.id;
        selectedWallpaperBase64 = stored.url;
        wallpaperSize = 100;
        wallpaperOffsetX = 50;
        wallpaperOffsetY = 50;
        document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
        const preview = document.getElementById('wallpaperPreview');
        preview.style.backgroundImage = `url(${selectedWallpaperBase64})`;
        preview.classList.add('has-image');
        updateWallpaperPreviewStyle();
      } catch (error) {
        console.error('Wallpaper image save failed:', error);
        alert('壁紙画像を保存できませんでした。別の画像を選ぶか、画像サイズを小さくしてください。');
      }
    }

    async function previewWallpaper(input) {
      await setMainWallpaperFile(input.files[0]);
      input.value = '';
    }

    function removeMainWallpaperImage() {
      selectedWallpaperBase64 = "";
      selectedWallpaperImageId = "";
      wallpaperSize = 100;
      wallpaperOffsetX = 50;
      wallpaperOffsetY = 50;
      const slider = document.getElementById('wallpaperSizeSlider');
      if (slider) slider.value = wallpaperSize;
      const preview = document.getElementById('wallpaperPreview');
      if (preview) {
        preview.style.backgroundImage = "";
        preview.classList.remove('has-image');
      }
      updateWallpaperPreviewStyle();
    }

    function initWallpaperDropArea() {
      const modal = document.getElementById('wallpaperModal');
      const preview = document.getElementById('wallpaperPreview');
      if (!modal || !preview) return;
      preview.ondragenter = event => {
        event.preventDefault();
        modal.querySelector('.wallpaper-modal-content')?.classList.add('drag-over');
      };
      preview.ondragover = event => {
        event.preventDefault();
        modal.querySelector('.wallpaper-modal-content')?.classList.add('drag-over');
      };
      preview.ondragleave = event => {
        if (!preview.contains(event.relatedTarget)) modal.querySelector('.wallpaper-modal-content')?.classList.remove('drag-over');
      };
      preview.ondrop = event => {
        event.preventDefault();
        modal.querySelector('.wallpaper-modal-content')?.classList.remove('drag-over');
        const file = Array.from(event.dataTransfer?.files || []).find(item => /^image\/(jpeg|png|webp|jpg)/i.test(item.type));
        if (file) setMainWallpaperFile(file);
      };
    }

    function updateWallpaperPreviewStyle() {
      wallpaperSize = parseInt(document.getElementById('wallpaperSizeSlider').value);
      document.getElementById('wallpaperSizeVal').innerText = wallpaperSize + "%";

      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundSize = wallpaperSize + "%";
      preview.style.backgroundPosition = `${wallpaperOffsetX}% ${wallpaperOffsetY}%`;
      preview.classList.toggle('has-image', !!selectedWallpaperBase64);
    }

    // 壁紙画面の「保存していない変更」を判定するための状態の写し
    let savedWallpaperEditorSnapshot = '';
    let lastWallpaperSaveAt = 0;

    function wallpaperEditorSnapshot() {
      return JSON.stringify({
        imageId: selectedWallpaperImageId,
        image: selectedWallpaperImageId ? '' : String(selectedWallpaperBase64 || '').slice(0, 120),
        size: wallpaperSize,
        offsetX: wallpaperOffsetX,
        offsetY: wallpaperOffsetY,
        sceneEnabled: !!document.getElementById('sceneWallpaperToggle')?.checked,
        scenes: editingSceneWallpapers.map(scene => ({
          id: scene.id, name: scene.name, talkIds: scene.talkIds, imageId: scene.imageId,
          image: String(scene.image || '').slice(0, 120), size: scene.size, offsetX: scene.offsetX, offsetY: scene.offsetY
        }))
      });
    }

    function setWallpaperSaveStatus(text) {
      const status = document.getElementById('wallpaperSaveStatus');
      if (!status) return;
      status.textContent = text || '';
      clearTimeout(setWallpaperSaveStatus.timer);
      if (text) setWallpaperSaveStatus.timer = setTimeout(() => { status.textContent = ''; }, 2500);
    }

    // 「閉じる」：保存していない変更があれば確認してから閉じる
    function closeWallpaperModal() {
      if (wallpaperEditorSnapshot() !== savedWallpaperEditorSnapshot &&
          !confirm('保存していない変更があります。保存せずに閉じますか？')) return;
      closeModal('wallpaperModal');
    }

    // 「保存」：設定を反映するが、画面は閉じない（続けて別のシーンを設定できる）
    function confirmWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      // ボタンはタッチ・ポインター・クリックの各イベントで呼ばれるので、連続呼び出しは1回にまとめる
      if (Date.now() - lastWallpaperSaveAt < 600) return;
      lastWallpaperSaveAt = Date.now();

      pushUndoSnapshot();
      project.wallpaper = (selectedWallpaperImageId || selectedWallpaperBase64) ? {
        imageId: selectedWallpaperImageId,
        image: selectedWallpaperImageId ? "" : selectedWallpaperBase64,
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
      if (editorDisplayMode === 'script') renderTimeline();
      saveState();
      savedWallpaperEditorSnapshot = wallpaperEditorSnapshot();
      setWallpaperSaveStatus('保存しました ✓');
    }

    function clearWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      if (!confirm('通常壁紙を削除しますか？')) return;
      const hadOtherChanges = wallpaperEditorSnapshot() !== savedWallpaperEditorSnapshot;

      pushUndoSnapshot();
      project.wallpaper = null;
      removeMainWallpaperImage();
      saveState();
      applyProjectWallpaper(true);
      // シーンの編集中の変更はまだ保存していないので、その場合は「未保存」のままにする
      if (!hadOtherChanges) savedWallpaperEditorSnapshot = wallpaperEditorSnapshot();
      setWallpaperSaveStatus('通常壁紙を削除しました');
    }

    function applyProjectWallpaper(forceUpdate = false) {
      const project = state.projects[state.currentProjectId];
      if (editorDisplayMode === 'script') {
        setEditorWallpaper(project?.wallpaper || null, 'script-fixed:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
        return;
      }
      const sceneSettings = getSceneWallpaperSettings(project);
      if (sceneSettings.enabled && sceneSettings.scenes.some(scene => wallpaperHasImage(scene))) {
        updateSceneWallpaperByScroll(forceUpdate);
        return;
      }
      setEditorWallpaper(project?.wallpaper || null, 'single:' + getWallpaperIdentity(project?.wallpaper), forceUpdate);
    }

    function getWallpaperIdentity(wallpaper) {
      if (!wallpaperHasImage(wallpaper)) return 'none';
      return [wallpaper.imageId || String(wallpaper.image || wallpaper.imageUrl || '').slice(0, 64), wallpaper.size || 100, wallpaper.offsetX ?? 50, wallpaper.offsetY ?? 50].join('|');
    }

    function getWallpaperLayers() {
      return [document.getElementById('editorWallpaperLayer'), document.getElementById('editorWallpaperLayerNext')].filter(Boolean);
    }

    function isChatWallpaperContainMode() {
      return editorDisplayMode !== 'script';
    }

    function updateEditorDesktopChatWallpaperFrame() {
      const layers = getWallpaperLayers();
      const editorView = document.getElementById('editorView');
      const timeline = document.getElementById('talkTimeline');
      if (!layers.length) return;
      if (!isChatWallpaperContainMode() || !editorView || !timeline) {
        layers.forEach(layer => {
          layer.style.removeProperty('--chat-wallpaper-frame-top');
          layer.style.removeProperty('--chat-wallpaper-frame-bottom');
        });
        return;
      }
      const viewRect = editorView.getBoundingClientRect();
      const timelineRect = timeline.getBoundingClientRect();
      const top = Math.max(0, Math.round(timelineRect.top - viewRect.top));
      const bottom = Math.max(0, Math.round(viewRect.bottom - timelineRect.bottom));
      layers.forEach(layer => {
        layer.style.setProperty('--chat-wallpaper-frame-top', top + 'px');
        layer.style.setProperty('--chat-wallpaper-frame-bottom', bottom + 'px');
      });
    }

    function setEditorWallpaper(wallpaper, key, forceUpdate = false) {
      const layers = getWallpaperLayers();
      if (layers.length === 0) return;
      updateEditorDesktopChatWallpaperFrame();
      if (!forceUpdate && key === currentWallpaperKey) return;
      const current = layers[activeWallpaperLayerIndex] || layers[0];
      const nextIndex = layers.length > 1 ? 1 - activeWallpaperLayerIndex : activeWallpaperLayerIndex;
      const next = layers[nextIndex] || current;
      styleWallpaperLayer(next, wallpaper, key);
      if (layers.length > 1 && next !== current) {
        next.classList.add('active');
        current.classList.remove('active');
        activeWallpaperLayerIndex = nextIndex;
      } else {
        next.classList.add('active');
      }
      currentWallpaperKey = key;
    }

    async function styleWallpaperLayer(layer, wallpaper, key = '') {
      if (!layer) return;
      updateEditorDesktopChatWallpaperFrame();
      const expectedKey = key || getWallpaperIdentity(wallpaper);
      layer.dataset.wallpaperKey = expectedKey;
      if (!wallpaperHasImage(wallpaper)) {
        layer.style.backgroundImage = "";
        layer.style.backgroundSize = "";
        layer.style.backgroundPosition = "";
        layer.style.removeProperty('--chat-wallpaper-image');
        layer.style.removeProperty('--chat-wallpaper-position');
        layer.style.transform = "";
        return;
      }
      const size = wallpaper.size || 100;
      const imageUrl = await resolveWallpaperUrl(wallpaper);
      if (layer.dataset.wallpaperKey !== expectedKey) return;
      if (!imageUrl) {
        layer.style.backgroundImage = "";
        layer.style.removeProperty('--chat-wallpaper-image');
        layer.style.removeProperty('--chat-wallpaper-position');
        return;
      }
      layer.style.backgroundImage = 'url(' + imageUrl + ')';
      layer.style.backgroundSize = size === 100 ? 'cover' : size + '%';
      layer.style.backgroundPosition = (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%';
      layer.style.setProperty('--chat-wallpaper-image', 'url("' + imageUrl.replace(/"/g, '\\"') + '")');
      layer.style.setProperty('--chat-wallpaper-position', (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%');
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
      const scenes = settings.scenes.filter(scene => wallpaperHasImage(scene) && Array.isArray(scene.talkIds) && scene.talkIds.length > 0).slice();
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
      const bubbles = Array.from(timeline.querySelectorAll('.chat-bubble'));
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
        empty.innerHTML = '<p>シーンを追加すると、選択したセリフごとに壁紙を切り替えられます。</p><button type="button" class="btn-scene-add" onclick="addSceneWallpaper()">＋ シーン追加</button>';
        list.appendChild(empty);
        return;
      }
      if (!editingSceneWallpapers.some(scene => scene.id === activeSceneWallpaperId)) {
        activeSceneWallpaperId = editingSceneWallpapers[0]?.id || "";
      }
      const tabs = document.createElement('div');
      tabs.className = 'scene-wallpaper-tabs';
      tabs.innerHTML = editingSceneWallpapers.map((scene, index) => {
        const active = scene.id === activeSceneWallpaperId ? ' active' : '';
        return '<button type="button" class="scene-wallpaper-tab' + active + '" onclick="selectSceneWallpaperTab(\'' + scene.id + '\')">' + escapeHtml(scene.name || ('シーン' + (index + 1))) + '</button>';
      }).join('') + '<button type="button" class="scene-wallpaper-tab add" onclick="addSceneWallpaper()">＋</button>';
      list.appendChild(tabs);

      const scene = editingSceneWallpapers.find(item => item.id === activeSceneWallpaperId) || editingSceneWallpapers[0];
      if (!scene) return;
      const card = document.createElement('div');
      card.className = 'scene-wallpaper-card';
      card.dataset.sceneId = scene.id;
      const fileId = 'sceneWallpaperInput_' + scene.id;
      const rangeDefault = sceneRangeDefaultNumbers(scene, project);
      const startOptions = renderSceneRangeOptions(project, rangeDefault.start);
      const endOptions = renderSceneRangeOptions(project, rangeDefault.end);
      const charOptions = ['<option value="">話者で絞り込み</option>'].concat(project.characters.map(char => '<option value="' + escapeHtml(char.name) + '">' + escapeHtml(char.name) + '</option>')).join('');
      card.innerHTML =
        '<div class="scene-wallpaper-card-head">' +
          '<input type="text" value="' + escapeHtml(scene.name) + '" placeholder="シーン名" oninput="updateSceneWallpaperField(\'' + scene.id + '\', \'name\', this.value)">' +
          '<button type="button" class="btn-scene-delete" onclick="deleteSceneWallpaper(\'' + scene.id + '\')">削除</button>' +
        '</div>' +
        '<div class="scene-wallpaper-main">' +
          '<div class="scene-wallpaper-dropzone" data-scene-wallpaper-drop="' + scene.id + '" data-scene-wallpaper-thumb="' + scene.id + '" style="background-image:' + (scene.image ? 'url(' + scene.image + ')' : 'none') + '"><span>＋ 画像を設定</span></div>' +
          '<div class="scene-wallpaper-image-actions">' +
            '<label class="scene-wallpaper-file-btn" for="' + fileId + '">画像を変更</label>' +
            '<button type="button" class="scene-wallpaper-remove-btn" onclick="removeSceneWallpaperImage(\'' + scene.id + '\')">画像を削除</button>' +
          '</div>' +
          '<input id="' + fileId + '" type="file" accept="image/*" style="display:none" onchange="previewSceneWallpaperImage(this, \'' + scene.id + '\')">' +
        '</div>' +
        '<div class="scene-range-tools">' +
          '<strong class="scene-range-title">適用範囲</strong>' +
          '<label for="sceneRangeStart_' + scene.id + '">開始</label>' +
          '<select id="sceneRangeStart_' + scene.id + '">' + startOptions + '</select>' +
          '<label for="sceneRangeEnd_' + scene.id + '">終了</label>' +
          '<select id="sceneRangeEnd_' + scene.id + '">' + endOptions + '</select>' +
          '<button type="button" onclick="applySceneTalkRange(\'' + scene.id + '\', true)">範囲を選択</button>' +
          '<button type="button" class="scene-range-clear" onclick="applySceneTalkRange(\'' + scene.id + '\', false)">範囲を解除</button>' +
          '<button type="button" onclick="selectAllSceneTalks(\'' + scene.id + '\')">全選択</button>' +
          '<button type="button" class="scene-range-clear" onclick="clearSceneTalks(\'' + scene.id + '\')">全解除</button>' +
        '</div>' +
        '<div class="scene-talk-tools">' +
          '<span id="sceneTalkCount_' + scene.id + '">' + getSceneTalkCountLabel(scene) + '</span>' +
          '<label class="scene-range-mode"><input type="checkbox" ' + (sceneRangeSelectMode ? 'checked' : '') + ' onchange="setSceneRangeSelectMode(this.checked)">開始→終了でまとめて選択</label>' +
        '</div>' +
        '<p class="scene-range-status" id="sceneRangeStatus"></p>' +
        '<div class="scene-talk-filters">' +
          '<input type="search" id="sceneTalkSearch_' + scene.id + '" placeholder="検索" oninput="filterSceneTalkOptions(\'' + scene.id + '\')">' +
          '<select id="sceneTalkChar_' + scene.id + '" onchange="filterSceneTalkOptions(\'' + scene.id + '\')">' + charOptions + '</select>' +
        '</div>' +
        '<div class="scene-talk-list" id="sceneTalkList_' + scene.id + '">' + renderSceneTalkOptions(scene, project) + '</div>';
      list.appendChild(card);
      if (sceneRangeAnchor && sceneRangeAnchor.sceneId !== scene.id) sceneRangeAnchor = null;
      resolveSceneWallpaperThumbs();
      initSceneWallpaperDropzones();
      syncSceneTalkSelectionDom();
      updateSceneRangeAnchorUi();
    }

    function selectSceneWallpaperTab(id) {
      if (!editingSceneWallpapers.some(scene => scene.id === id)) return;
      activeSceneWallpaperId = id;
      renderSceneWallpaperList();
    }

    function sceneRangeDefaultNumbers(scene, project) {
      const indexes = (scene.talkIds || []).map(id => (project.talks || []).findIndex(talk => talk.id === id) + 1).filter(index => index > 0);
      if (indexes.length) return { start: Math.min(...indexes), end: Math.max(...indexes) };
      return { start: 1, end: Math.max(1, (project.talks || []).length) };
    }

    function renderSceneRangeOptions(project, selectedNumber) {
      return (project.talks || []).map((talk, index) => {
        const number = String(index + 1).padStart(3, '0');
        const name = escapeHtml(talk.charName || '');
        const selected = Number(selectedNumber) === index + 1 ? ' selected' : '';
        return '<option value="' + (index + 1) + '"' + selected + '>' + number + ' ' + name + '</option>';
      }).join('');
    }

    function resolveSceneWallpaperThumbs() {
      editingSceneWallpapers.forEach(scene => {
        const thumb = document.querySelector('[data-scene-wallpaper-thumb="' + scene.id + '"]');
        if (!thumb) return;
        resolveWallpaperUrl(scene).then(url => {
          thumb.style.backgroundImage = url ? 'url(' + url + ')' : 'none';
          thumb.classList.toggle('has-image', !!url);
        });
      });
    }

    function initSceneWallpaperDropzones() {
      document.querySelectorAll('[data-scene-wallpaper-drop]').forEach(zone => {
        const sceneId = zone.dataset.sceneWallpaperDrop;
        zone.ondragenter = event => {
          event.preventDefault();
          zone.closest('.scene-wallpaper-card')?.classList.add('drag-over');
        };
        zone.ondragover = event => {
          event.preventDefault();
          zone.closest('.scene-wallpaper-card')?.classList.add('drag-over');
        };
        zone.ondragleave = event => {
          if (!zone.contains(event.relatedTarget)) zone.closest('.scene-wallpaper-card')?.classList.remove('drag-over');
        };
        zone.ondrop = event => {
          event.preventDefault();
          zone.closest('.scene-wallpaper-card')?.classList.remove('drag-over');
          const file = Array.from(event.dataTransfer?.files || []).find(item => /^image\/(jpeg|png|webp|jpg)/i.test(item.type));
          if (file) setSceneWallpaperFile(sceneId, file);
        };
      });
    }

    function renderSceneTalkOptions(scene, project) {
      return project.talks.map((talk, index) => {
        const checked = (scene.talkIds || []).includes(talk.id) ? 'checked' : '';
        const owner = getSceneSelectionOwner(talk.id, scene.id);
        const ownedClass = owner ? ' scene-talk-owned' : '';
        const summary = escapeHtml((talk.text || '').replace(/\s+/g, ' ').slice(0, 42));
        const charName = escapeHtml(talk.charName || '');
        const ownerText = owner ? '<small>' + escapeHtml(owner.name) + 'で選択中</small>' : '';
        return '<label class="scene-talk-option' + ownedClass + (checked ? ' is-selected' : '') + '" data-talk-id="' + talk.id + '" data-char="' + charName + '" data-search="' + escapeHtml((talk.charName || '') + ' ' + (talk.text || '')) + '">' +
          '<input type="checkbox" ' + checked + ' onchange="toggleSceneTalkSelection(\'' + scene.id + '\', \'' + talk.id + '\', this.checked)">' +
          '<span><strong>' + String(index + 1).padStart(3, '0') + ' ' + charName + '</strong><em>' + summary + '</em>' + ownerText + '</span>' +
        '</label>';
      }).join('');
    }

    function getSceneSelectionOwner(talkId, currentSceneId) {
      return editingSceneWallpapers.find(scene => scene.id !== currentSceneId && Array.isArray(scene.talkIds) && scene.talkIds.includes(talkId)) || null;
    }

    function getSceneTalkCountLabel(scene) {
      const count = (scene.talkIds || []).length;
      return '選択中: ' + count + '\u4ef6';
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
      document.querySelectorAll('.scene-talk-option').forEach(row => {
        if (talkId && row.dataset.talkId !== talkId) return;
        const owner = editingSceneWallpapers.find(scene => Array.isArray(scene.talkIds) && scene.talkIds.includes(row.dataset.talkId)) || null;
        const list = row.closest('.scene-talk-list');
        const sceneId = list ? list.id.replace(/^sceneTalkList_/, '') : '';
        const input = row.querySelector('input[type="checkbox"]');
        const textWrap = row.querySelector('span');
        const oldOwnerLabel = row.querySelector('small');
        const isOwnerScene = !!owner && owner.id === sceneId;
        if (input) input.checked = isOwnerScene;
        row.classList.toggle('is-selected', isOwnerScene);
        row.classList.toggle('scene-talk-owned', !!owner && !isOwnerScene);
        if (oldOwnerLabel) oldOwnerLabel.remove();
        if (owner && !isOwnerScene && textWrap) {
          const ownerLabel = document.createElement('small');
          ownerLabel.textContent = owner.name + 'で選択中';
          textWrap.appendChild(ownerLabel);
        }
      });
      updateSceneTalkCountLabels();
    }

    function addSceneWallpaper() {
      const nextIndex = editingSceneWallpapers.length + 1;
      const scene = { id: 'scene_' + Date.now() + '_' + Math.floor(Math.random() * 1000), name: 'シーン' + nextIndex, talkIds: [], imageId: '', image: '', order: nextIndex - 1, size: 100, offsetX: 50, offsetY: 50 };
      editingSceneWallpapers.push(scene);
      activeSceneWallpaperId = scene.id;
      renderSceneWallpaperList();
      const toggle = document.getElementById('sceneWallpaperToggle');
      if (toggle) toggle.checked = true;
      toggleSceneWallpaperControls();
    }

    function deleteSceneWallpaper(id) {
      const scene = editingSceneWallpapers.find(item => item.id === id);
      if (!scene) return;
      if (!confirm((scene.name || 'シーン') + 'を削除しますか？')) return;
      const oldIndex = editingSceneWallpapers.findIndex(item => item.id === id);
      editingSceneWallpapers = editingSceneWallpapers.filter(scene => scene.id !== id);
      if (activeSceneWallpaperId === id) {
        activeSceneWallpaperId = editingSceneWallpapers[Math.max(0, oldIndex - 1)]?.id || editingSceneWallpapers[0]?.id || "";
      }
      renderSceneWallpaperList();
    }

    function updateSceneWallpaperField(id, field, value) {
      const scene = editingSceneWallpapers.find(item => item.id === id);
      if (!scene) return;
      scene[field] = value;
      if (field === 'name') {
        const tab = document.querySelector('.scene-wallpaper-tab.active');
        if (tab && activeSceneWallpaperId === id) tab.textContent = value || 'シーン';
      }
    }

    // 「開始→終了」をタップして間をまとめて選択するモード（オフにすると1件ずつ選択）
    let sceneRangeSelectMode = true;
    let sceneRangeAnchor = null; // { sceneId, talkId }：開始としてタップしたセリフ

    function setSceneRangeSelectMode(enabled) {
      sceneRangeSelectMode = !!enabled;
      sceneRangeAnchor = null;
      updateSceneRangeAnchorUi();
    }

    function talkLabelById(talkId) {
      const project = state.projects[state.currentProjectId];
      const index = (project?.talks || []).findIndex(talk => talk.id === talkId);
      return index < 0 ? '' : formatTalkNumber(index) + ' ' + (project.talks[index].charName || '');
    }

    function updateSceneRangeAnchorUi(message) {
      document.querySelectorAll('.scene-talk-option').forEach(row => {
        row.classList.toggle('is-range-anchor', !!sceneRangeAnchor && row.dataset.talkId === sceneRangeAnchor.talkId);
      });
      const status = document.getElementById('sceneRangeStatus');
      if (!status) return;
      if (message) status.textContent = message;
      else if (!sceneRangeSelectMode) status.textContent = '1件ずつ選択します。';
      else if (sceneRangeAnchor) status.textContent = '開始：' + talkLabelById(sceneRangeAnchor.talkId) + '　→ 次に「終了」のセリフをタップしてください';
      else status.textContent = '「開始」のセリフ → 「終了」のセリフの順にタップすると、間のセリフもまとめて選択されます';
    }

    function assignTalksToScene(scene, talkIds) {
      editingSceneWallpapers.forEach(item => {
        if (item.id !== scene.id) item.talkIds = (item.talkIds || []).filter(id => !talkIds.includes(id));
      });
      scene.talkIds = [...new Set([...(scene.talkIds || []), ...talkIds])];
    }

    function toggleSceneTalkSelection(sceneId, talkId, checked) {
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      const project = state.projects[state.currentProjectId];
      if (!scene || !project) return;
      let message = '';
      if (checked && sceneRangeSelectMode && sceneRangeAnchor?.sceneId === sceneId && sceneRangeAnchor.talkId !== talkId) {
        // 2回目のタップ：開始〜終了の間をすべてこのシーンにする
        const indexes = [sceneRangeAnchor.talkId, talkId].map(id => project.talks.findIndex(talk => talk.id === id)).filter(index => index >= 0);
        const start = Math.min(...indexes);
        const end = Math.max(...indexes);
        const ids = project.talks.slice(start, end + 1).map(talk => talk.id).filter(Boolean);
        assignTalksToScene(scene, ids);
        message = formatTalkNumber(start) + '〜' + formatTalkNumber(end) + '（' + ids.length + '件）を「' + (scene.name || 'シーン') + '」に設定しました';
        sceneRangeAnchor = null;
      } else {
        editingSceneWallpapers.forEach(item => {
          item.talkIds = (item.talkIds || []).filter(id => id !== talkId);
        });
        if (checked) scene.talkIds = [...(scene.talkIds || []), talkId];
        if (checked && sceneRangeSelectMode) sceneRangeAnchor = { sceneId, talkId };
        else if (sceneRangeAnchor?.talkId === talkId) sceneRangeAnchor = null;
      }
      enforceUniqueSceneTalkSelections(editingSceneWallpapers);
      syncSceneTalkSelectionDom();
      updateSceneRangeAnchorUi(message);
    }

    function sceneRangeTalkIds(sceneId) {
      const project = state.projects[state.currentProjectId];
      if (!project) return [];
      ensureTalkIds(project);
      const startInput = document.getElementById('sceneRangeStart_' + sceneId);
      const endInput = document.getElementById('sceneRangeEnd_' + sceneId);
      let start = parseInt(startInput?.value, 10) || 1;
      let end = parseInt(endInput?.value, 10) || start;
      if (start > end) [start, end] = [end, start];
      return project.talks.slice(start - 1, end).map(talk => talk.id).filter(Boolean);
    }

    function applySceneTalkRange(sceneId, shouldSelect) {
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!scene) return;
      const ids = sceneRangeTalkIds(sceneId);
      if (shouldSelect) {
        editingSceneWallpapers.forEach(item => {
          if (item.id !== sceneId) item.talkIds = (item.talkIds || []).filter(id => !ids.includes(id));
        });
        scene.talkIds = [...new Set([...(scene.talkIds || []), ...ids])];
      } else {
        scene.talkIds = (scene.talkIds || []).filter(id => !ids.includes(id));
      }
      enforceUniqueSceneTalkSelections(editingSceneWallpapers);
      syncSceneTalkSelectionDom();
    }

    function selectAllSceneTalks(sceneId) {
      const project = state.projects[state.currentProjectId];
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!project || !scene) return;
      const ids = project.talks.map(talk => talk.id);
      editingSceneWallpapers.forEach(item => {
        if (item.id !== sceneId) item.talkIds = (item.talkIds || []).filter(id => !ids.includes(id));
      });
      scene.talkIds = [...new Set([...(scene.talkIds || []), ...ids])];
      enforceUniqueSceneTalkSelections(editingSceneWallpapers);
      syncSceneTalkSelectionDom();
    }

    function clearSceneTalks(sceneId) {
      const scene = editingSceneWallpapers.find(item => item.id === sceneId);
      if (!scene) return;
      scene.talkIds = [];
      syncSceneTalkSelectionDom();
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

    async function setSceneWallpaperFile(id, file) {
      if (!file) return;
      try {
        const stored = await storeWallpaperFile(file);
        const scene = editingSceneWallpapers.find(item => item.id === id);
        if (!scene) return;
        scene.imageId = stored.id;
        scene.image = "";
        scene.imageUrl = stored.url;
        scene.size = 100;
        scene.offsetX = 50;
        scene.offsetY = 50;
        activeSceneWallpaperId = id;
        renderSceneWallpaperList();
      } catch (error) {
        console.error('Scene wallpaper image save failed:', error);
        alert('シーン壁紙画像を保存できませんでした。別の画像を選んでください。');
      }
    }

    function removeSceneWallpaperImage(id) {
      const scene = editingSceneWallpapers.find(item => item.id === id);
      if (!scene) return;
      scene.imageId = '';
      scene.image = '';
      scene.imageUrl = '';
      const thumb = document.querySelector('[data-scene-wallpaper-thumb="' + scene.id + '"]');
      if (thumb) {
        thumb.style.backgroundImage = 'none';
        thumb.classList.remove('has-image');
      }
    }

    async function previewSceneWallpaperImage(input, id) {
      await setSceneWallpaperFile(id, input.files[0]);
      input.value = '';
      return;
      const file = input.files[0];
      if (!file) return;
      try {
        const stored = await storeWallpaperFile(file);
        const scene = editingSceneWallpapers.find(item => item.id === id);
        if (!scene) return;
        scene.imageId = stored.id;
        scene.image = "";
        scene.imageUrl = stored.url;
        scene.size = 100;
        scene.offsetX = 50;
        scene.offsetY = 50;
        renderSceneWallpaperList();
      } catch (error) {
        console.error('Scene wallpaper image save failed:', error);
        alert('シーン壁紙画像を保存できませんでした。別の画像を選んでください。');
      }
    }

    function removeTalkIdsFromSceneSettings(project, talkIds) {
      if (!project || !project.sceneWallpaperSettings || !Array.isArray(talkIds)) return;
      project.sceneWallpaperSettings.scenes.forEach(scene => {
        scene.talkIds = (scene.talkIds || []).filter(id => !talkIds.includes(id));
      });
    }

    // 編集モードで選んだ最初〜最後のトークに、まとめて壁紙を設定する
    function getSelectedTalkRange() {
      const project = state.projects[state.currentProjectId];
      if (!project || selectedTalkIndexes.size === 0) return null;
      const indexes = [...selectedTalkIndexes].filter(index => index >= 0 && index < project.talks.length);
      if (!indexes.length) return null;
      const start = Math.min(...indexes);
      const end = Math.max(...indexes);
      return { start, end, talkIds: project.talks.slice(start, end + 1).map(talk => talk.id).filter(Boolean) };
    }

    function updateSelectedTalkRangeHighlight() {
      const range = getSelectedTalkRange();
      document.querySelectorAll('#talkTimeline .chat-bubble').forEach(bubble => {
        const index = Number(bubble.dataset.index);
        bubble.classList.toggle('in-wallpaper-range', !!range && isEditMode && index >= range.start && index <= range.end);
      });
      const button = document.getElementById('rangeWallpaperButton');
      if (button) {
        button.disabled = !range;
        button.textContent = range ? '壁紙 ' + formatTalkNumber(range.start) + '〜' + formatTalkNumber(range.end) : '壁紙';
      }
    }

    function openRangeWallpaperModal() {
      const project = state.projects[state.currentProjectId];
      const range = getSelectedTalkRange();
      if (!project || !range) {
        alert('壁紙を変えたい範囲の最初と最後のトークにチェックを入れてください。');
        return;
      }
      const startTalk = project.talks[range.start];
      const endTalk = project.talks[range.end];
      document.getElementById('rangeWallpaperLabel').textContent =
        formatTalkNumber(range.start) + ' ' + (startTalk?.charName || '') + ' 〜 ' +
        formatTalkNumber(range.end) + ' ' + (endTalk?.charName || '') + '（' + range.talkIds.length + '件）';
      const list = document.getElementById('rangeWallpaperSceneList');
      const scenes = getSceneWallpaperSettings(project).scenes.filter(scene => wallpaperHasImage(scene));
      list.innerHTML = scenes.length
        ? scenes.map(scene => '<button type="button" class="range-wallpaper-choice" onclick="applyRangeWallpaper(\'' + scene.id + '\')">' +
            '<span class="range-wallpaper-thumb" data-range-wallpaper-thumb="' + scene.id + '"></span>' +
            '<span>' + escapeHtml(scene.name || 'シーン') + '</span></button>').join('')
        : '<p class="range-wallpaper-empty">まだシーン壁紙はありません。下のボタンから画像を選んでください。</p>';
      scenes.forEach(scene => {
        resolveWallpaperUrl(scene).then(url => {
          const thumb = document.querySelector('[data-range-wallpaper-thumb="' + scene.id + '"]');
          if (thumb && url) thumb.style.backgroundImage = 'url(' + url + ')';
        });
      });
      openModal('rangeWallpaperModal');
    }

    async function chooseRangeWallpaperImage(input) {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      try {
        const stored = await storeWallpaperFile(file);
        const settings = getSceneWallpaperSettings(project);
        const nextIndex = settings.scenes.length + 1;
        const scene = {
          id: 'scene_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
          name: 'シーン' + nextIndex,
          talkIds: [], imageId: stored.id, image: '', imageUrl: stored.url,
          order: nextIndex - 1, size: 100, offsetX: 50, offsetY: 50
        };
        applyRangeWallpaper(null, scene);
      } catch (error) {
        console.error('Range wallpaper image save failed:', error);
        alert('壁紙画像を保存できませんでした。別の画像を選んでください。');
      }
    }

    // sceneId: 既存シーン / newScene: 新しく作るシーン / どちらも無し: 範囲のシーン壁紙を解除
    function applyRangeWallpaper(sceneId, newScene = null) {
      const project = state.projects[state.currentProjectId];
      const range = getSelectedTalkRange();
      if (!project || !range) return;
      pushUndoSnapshot();
      const settings = getSceneWallpaperSettings(project);
      settings.scenes.forEach(scene => {
        scene.talkIds = (scene.talkIds || []).filter(id => !range.talkIds.includes(id));
      });
      if (newScene) settings.scenes.push(newScene);
      const target = newScene || settings.scenes.find(scene => scene.id === sceneId);
      if (target) {
        target.talkIds = [...(target.talkIds || []), ...range.talkIds];
        settings.enabled = true;
      }
      enforceUniqueSceneTalkSelections(settings.scenes);
      closeModal('rangeWallpaperModal');
      const anchor = captureTimelineViewport();
      selectedTalkIndexes.clear();
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      applyProjectWallpaper(true);
    }
