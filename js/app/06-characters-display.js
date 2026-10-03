// ScriptMaker Editor — プロジェクトを開く・キャラクター・表示モード・色設定
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    function openProject(id) {
      state.currentProjectId = id;
      const project = state.projects[id];
      document.getElementById('openingView').classList.add('hidden');
      document.getElementById('editorView').classList.remove('hidden');
      document.getElementById('projectTitle').innerText = project.title;

      if (project.characters.length > 0) {
        currentCharacter = project.characters[0].name;
      } else {
        currentCharacter = '情景描写';
      }

      editingTalkIndex = null;
      editingTalkId = null;
      updateInlineEditState();
      applyProjectWallpaper();
      renderCharSelector();
      renderTimeline();
      updateMetaStats();
      setTimeout(scrollToBottom, 0);
      setTimeout(forceResizeViewport, 100);
    }

    function goBack() {
      document.getElementById('editorView').classList.add('hidden');
      document.getElementById('openingView').classList.remove('hidden');
      isEditMode = false;
      selectedTalkIndexes.clear();
      document.body.classList.remove('edit-mode-active');
      document.getElementById('modeToggleBtn').innerText = '編集';
      document.getElementById('modeToggleBtn').classList.remove('editing');
      editingTalkIndex = null;
      editingTalkId = null;
      updateInlineEditState();
      renderProjectList();
    }

    function renderCharSelector() {
      const container = document.getElementById('charSelectorContainer');
      container.innerHTML = '';
      const project = state.projects[state.currentProjectId];

      project.characters.forEach(char => {
        const btn = document.createElement('button');
        btn.className = `char-icon-btn ${currentCharacter === char.name ? 'active' : ''}`;
        btn.type = 'button';
        btn.dataset.characterName = char.name;

        let avatarHtml = '';
        if (char.avatar) {
          const radius = char.isRound !== false ? '50%' : '8px';
          const zoom = char.zoom || 100;
          const posX = char.offsetX ?? 50;
          const posY = char.offsetY ?? 50;
          avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${char.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
        } else {
          avatarHtml = `<div class="avatar-dummy">${char.name.substring(0,2)}</div>`;
        }

        btn.innerHTML = `${avatarHtml}<span class="char-name-mini">${char.name}</span>`;
        initCharacterDeleteDrag(btn, char.name);
        container.appendChild(btn);
      });

      const sceneBtn = document.createElement('button');
      sceneBtn.className = `char-icon-btn ${currentCharacter === '情景描写' ? 'active' : ''}`;
      sceneBtn.onpointerdown = function(e) { e.preventDefault(); selectChar(this, '情景描写'); };
      sceneBtn.onclick = function() { selectChar(this, '情景描写'); };
      sceneBtn.innerHTML = `<div class="effect-icon">💡</div><span class="char-name-mini">情景</span>`;
      container.appendChild(sceneBtn);

      const addBtn = document.createElement('button');
      addBtn.className = 'char-add-btn';
      addBtn.onclick = openCharacterLibraryModal;
      addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
      container.appendChild(addBtn);
    }

    function initCharacterDeleteDrag(btn, charName) {
      const longPressMs = 500;
      const moveCancelThreshold = 8;
      let timer = null;
      let startPoint = null;
      let movedBeforeLongPress = false;
      let longPressReady = false;
      let suppressNextClick = false;

      const clearTimer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      btn.addEventListener('pointerdown', function(e) {
        if (e.button != null && e.button !== 0) return;
        clearTimer();
        movedBeforeLongPress = false;
        longPressReady = false;
        startPoint = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
        timer = setTimeout(() => {
          timer = null;
          if (movedBeforeLongPress) return;
          longPressReady = true;
          suppressNextClick = true;
          suppressTalkClickUntil = Date.now() + 700;
          navigator.vibrate?.(25);
        }, longPressMs);
      });

      btn.addEventListener('pointermove', function(e) {
        if (!startPoint || startPoint.pointerId !== e.pointerId) return;
        const dx = e.clientX - startPoint.x;
        const dy = e.clientY - startPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (!characterDragState && distance > moveCancelThreshold) {
          if (!longPressReady) {
            movedBeforeLongPress = true;
            clearTimer();
            return;
          }
          e.preventDefault();
          startCharacterDeleteDrag(btn, charName, e);
          return;
        }
        if (characterDragState?.button === btn) {
          e.preventDefault();
          moveCharacterDragPreview(e);
        }
      });

      btn.addEventListener('pointerup', function(e) {
        clearTimer();
        if (characterDragState?.button === btn) {
          e.preventDefault();
          finishCharacterDeleteDrag(e);
          startPoint = null;
          return;
        }
        if (longPressReady && !movedBeforeLongPress) {
          e.preventDefault();
          openCharEditModal(charName);
          startPoint = null;
          longPressReady = false;
          return;
        }
        if (!movedBeforeLongPress) {
          e.preventDefault();
          selectChar(btn, charName);
        }
        startPoint = null;
        longPressReady = false;
      });

      btn.addEventListener('pointercancel', function() {
        clearTimer();
        cancelCharacterDeleteDrag();
        startPoint = null;
        longPressReady = false;
      });

      btn.addEventListener('click', function(e) {
        if (suppressNextClick || Date.now() < suppressTalkClickUntil) {
          e.preventDefault();
          e.stopPropagation();
          suppressNextClick = false;
        }
      });

      btn.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches && !characterDragState) {
          openCharEditModal(charName);
        }
      });
    }

    function startCharacterDeleteDrag(button, charName, pointerEvent) {
      const trashZone = document.getElementById('trashZone');
      if (!trashZone || characterDragState) return;
      suppressTalkClickUntil = Date.now() + 500;
      navigator.vibrate?.(30);

      const rect = button.getBoundingClientRect();
      const preview = button.cloneNode(true);
      preview.classList.add('character-drag-preview');
      preview.style.left = rect.left + rect.width / 2 + 'px';
      preview.style.top = rect.top + rect.height / 2 + 'px';
      document.body.appendChild(preview);

      button.classList.add('character-delete-drag-source');
      trashZone.classList.add('visible');
      trashZone.classList.add('character-delete-mode');
      button.setPointerCapture?.(pointerEvent.pointerId);

      characterDragState = {
        button,
        charName,
        preview,
        pointerId: pointerEvent.pointerId,
        droppedOnTrash: false,
        cleanupTimer: setTimeout(() => {
          cancelCharacterDeleteDrag();
        }, 15000)
      };
      document.addEventListener('pointermove', handleDocumentCharacterDragMove, { passive: false });
      document.addEventListener('pointerup', handleDocumentCharacterDragEnd, { passive: false });
      document.addEventListener('pointercancel', handleDocumentCharacterDragCancel, { passive: false });
      document.addEventListener('mousemove', handleDocumentCharacterDragMove, { passive: false });
      document.addEventListener('mouseup', handleDocumentCharacterDragEnd, { passive: false });
      moveCharacterDragPreview(pointerEvent);
    }

    function handleDocumentCharacterDragMove(e) {
      if (!isActiveCharacterDragEvent(e)) return;
      e.preventDefault();
      moveCharacterDragPreview(e);
    }

    function handleDocumentCharacterDragEnd(e) {
      if (!isActiveCharacterDragEvent(e)) return;
      e.preventDefault();
      finishCharacterDeleteDrag(e);
    }

    function handleDocumentCharacterDragCancel(e) {
      if (!isActiveCharacterDragEvent(e)) return;
      e.preventDefault();
      cancelCharacterDeleteDrag();
    }

    function isActiveCharacterDragEvent(e) {
      if (!characterDragState) return false;
      return typeof e.pointerId === 'undefined' || e.pointerId === characterDragState.pointerId;
    }

    function moveCharacterDragPreview(pointerEvent) {
      if (!characterDragState) return;
      const point = getPointerPoint(pointerEvent);
      if (!point) return;
      const { preview } = characterDragState;
      preview.style.left = point.clientX + 'px';
      preview.style.top = point.clientY + 'px';

      const trashZone = document.getElementById('trashZone');
      if (trashZone) {
        const overTrash = isPointerOverTrash(pointerEvent, trashZone);
        trashZone.classList.toggle('hover', overTrash);
        characterDragState.droppedOnTrash = overTrash;
      }
    }

    function finishCharacterDeleteDrag(pointerEvent) {
      if (!characterDragState) return;
      const { button, charName, pointerId } = characterDragState;
      const trashZone = document.getElementById('trashZone');
      const shouldDelete = trashZone && isPointerOverTrash(pointerEvent, trashZone);
      button.releasePointerCapture?.(pointerId);
      cleanupCharacterDeleteDrag();
      if (!shouldDelete) return;

      const message = `「${charName}」をキャラクター一覧から削除します。このキャラクターの既存セリフは削除されません。`;
      if (confirm(message)) {
        deleteProjectCharacter(charName);
      }
    }

    function cancelCharacterDeleteDrag() {
      if (!characterDragState) return;
      cleanupCharacterDeleteDrag();
    }

    function cleanupCharacterDeleteDrag() {
      const trashZone = document.getElementById('trashZone');
      if (characterDragState?.cleanupTimer) clearTimeout(characterDragState.cleanupTimer);
      if (characterDragState?.preview) characterDragState.preview.remove();
      if (characterDragState?.button) characterDragState.button.classList.remove('character-delete-drag-source');
      if (trashZone) {
        trashZone.classList.remove('visible');
        trashZone.classList.remove('hover');
        trashZone.classList.remove('character-delete-mode');
      }
      document.removeEventListener('pointermove', handleDocumentCharacterDragMove);
      document.removeEventListener('pointerup', handleDocumentCharacterDragEnd);
      document.removeEventListener('pointercancel', handleDocumentCharacterDragCancel);
      document.removeEventListener('mousemove', handleDocumentCharacterDragMove);
      document.removeEventListener('mouseup', handleDocumentCharacterDragEnd);
      characterDragState = null;
    }

    function deleteProjectCharacter(charName) {
      const project = state.projects[state.currentProjectId];
      if (!project || !Array.isArray(project.characters)) return;
      const index = project.characters.findIndex(char => char.name === charName);
      if (index < 0) return;

      const removed = project.characters[index];
      const snapshot = characterSnapshot(removed);
      const anchor = captureTimelineViewport();
      pushUndoSnapshot();

      project.talks.forEach(talk => {
        if (talk.charName === charName) talk.characterSnapshot = snapshot;
      });
      project.characters.splice(index, 1);

      if (currentCharacter === charName) {
        const fallback = project.characters[Math.max(0, Math.min(index - 1, project.characters.length - 1))];
        currentCharacter = fallback?.name || project.characters[0]?.name || '情景描写';
      }

      renderCharSelector();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
      saveState();
    }

    function selectChar(element, name) {
      const input = document.getElementById('inputSpeech');
      const shouldKeepKeyboard = document.body.classList.contains('keyboard-focused') || document.activeElement === input;

      document.querySelectorAll('.char-icon-btn').forEach(b => b.classList.remove('active'));
      element.classList.add('active');
      currentCharacter = name;
      if (editingTalkId !== null) updateInlineEditState();
      renderInputStageDirectionHighlight();

      if (shouldKeepKeyboard) {
        setTimeout(() => input.focus({ preventScroll: true }), 0);
      }
    }

    function updatePreviewStyle() {
      const isRound = document.getElementById('charRoundCheck').checked;
      const zoom = document.getElementById('charZoomSlider').value;
      document.getElementById('zoomVal').innerText = zoom + "%";
      const preview = document.getElementById('avatarPreview');
      preview.style.borderRadius = isRound ? '50%' : '8px';
      preview.style.backgroundSize = zoom + "%";
      preview.style.backgroundPosition = `${avatarOffsetX}% ${avatarOffsetY}%`;
    }

    function openCharAddModal() {
      resetAvatarGesture();
      characterSaveInProgress = false;
      charModalMode = 'project-add';
      editingCharName = null;
      editingLibraryCharacterSignature = null;
      selectedAvatarBase64 = "";
      avatarOffsetX = 50;
      avatarOffsetY = 50;
      document.getElementById('charModalTitle').innerText = "キャラクター追加";
      document.getElementById('charConfirmBtn').innerText = "追加";
      document.getElementById('newCharName').value = "";
      document.getElementById('newCharAvatar').value = "";
      document.getElementById('newCharName').disabled = false;
      document.getElementById('charRoundCheck').checked = true;
      const project = state.projects[state.currentProjectId];
      document.getElementById('charProtagonistCheck').checked = !project.characters.some(c => c.isProtagonist);
      document.getElementById('charZoomSlider').value = 100;
      const preview = document.getElementById('avatarPreview');
      preview.style.backgroundImage = "";
      updatePreviewStyle();
      openModal('charModal');
    }

    function openCharEditModal(name) {
      resetAvatarGesture();
      characterSaveInProgress = false;
      charModalMode = 'project-edit';
      editingCharName = name;
      editingLibraryCharacterSignature = null;
      const project = state.projects[state.currentProjectId];
      const char = project.characters.find(c => c.name === name);
      if (!char) return;

      document.getElementById('charModalTitle').innerText = `${name}を編集`;
      document.getElementById('charConfirmBtn').innerText = "変更を保存";
      document.getElementById('newCharName').value = char.name;
      document.getElementById('newCharAvatar').value = "";
      document.getElementById('newCharName').disabled = false;
      
      selectedAvatarBase64 = char.avatar || "";
      document.getElementById('charRoundCheck').checked = char.isRound !== false;
      document.getElementById('charProtagonistCheck').checked = !!char.isProtagonist;
      document.getElementById('charZoomSlider').value = char.zoom || 100;

      const preview = document.getElementById('avatarPreview');
      if (char.avatar) {
        preview.style.backgroundImage = `url(${char.avatar})`;
      } else {
        preview.style.backgroundImage = "";
      }
      avatarOffsetX = char.offsetX ?? 50;
      avatarOffsetY = char.offsetY ?? 50;
      updatePreviewStyle();
      openModal('charModal');
    }

    function openLibraryCharacterEdit(signature) {
      const character = findLibraryCharacter(signature);
      if (!character) return;
      resetAvatarGesture();
      characterSaveInProgress = false;
      charModalMode = 'library-edit';
      editingCharName = null;
      editingLibraryCharacterSignature = signature;

      document.getElementById('charModalTitle').innerText = 'ライブラリのキャラクター編集';
      document.getElementById('charConfirmBtn').innerText = "変更を保存";
      document.getElementById('newCharName').value = character.name;
      document.getElementById('newCharAvatar').value = "";
      document.getElementById('newCharName').disabled = false;
      selectedAvatarBase64 = character.avatar || '';
      document.getElementById('charRoundCheck').checked = character.isRound !== false;
      document.getElementById('charProtagonistCheck').checked = false;
      document.getElementById('charZoomSlider').value = character.zoom || 100;
      avatarOffsetX = character.offsetX ?? 50;
      avatarOffsetY = character.offsetY ?? 50;

      const preview = document.getElementById('avatarPreview');
      preview.style.backgroundImage = character.avatar ? `url(${character.avatar})` : '';
      updatePreviewStyle();
      closeModal('charLibraryModal');
      openModal('charModal');
    }

    function previewAvatar(input) {
      const file = input.files[0];
      if (!file) return;
      compressImageFile(file, 512, 0.86, function(dataUrl) {
        selectedAvatarBase64 = dataUrl;
        avatarOffsetX = 50;
        avatarOffsetY = 50;
        document.getElementById('avatarPreview').style.backgroundImage = `url(${selectedAvatarBase64})`;
        updatePreviewStyle();
      });
    }

    function compressImageFile(file, maxSize, quality, callback) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          callback(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function() {
          callback(e.target.result);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function confirmSaveCharacter() {
      if (characterSaveInProgress) return;
      characterSaveInProgress = true;
      resetAvatarGesture();
      const name = document.getElementById('newCharName').value.trim();
      if (!name) {
        characterSaveInProgress = false;
        return;
      }

      const project = state.projects[state.currentProjectId];
      const isRound = document.getElementById('charRoundCheck').checked;
      const isProtagonist = document.getElementById('charProtagonistCheck').checked;
      const zoom = parseInt(document.getElementById('charZoomSlider').value);

      if (charModalMode === 'library-edit') {
        const updated = normalizeLibraryCharacter({
          name,
          avatar: selectedAvatarBase64,
          isRound,
          zoom,
          offsetX: avatarOffsetX,
          offsetY: avatarOffsetY
        });
        if (!updated) {
          characterSaveInProgress = false;
          return;
        }
        const library = loadCharacterLibrary().filter(item => characterLibrarySignature(item) !== editingLibraryCharacterSignature);
        mergeCharacterIntoLibraryList(library, updated);
        saveCharacterLibrary(library);
        editingLibraryCharacterSignature = null;
        closeModal('charModal');
        renderCharacterLibrary();
        openModal('charLibraryModal');
        setTimeout(() => { characterSaveInProgress = false; }, 0);
        return;
      }

      if (editingCharName === null) {
        if (project.characters.some(c => c.name === name) || name === '情景描写') {
          alert("同名のキャラクターが既に存在します。");
          characterSaveInProgress = false;
          return;
        }
        pushUndoSnapshot();
        if (isProtagonist) project.characters.forEach(c => c.isProtagonist = false);
        const newCharacter = { name: name, avatar: selectedAvatarBase64, isRound: isRound, zoom: zoom, offsetX: avatarOffsetX, offsetY: avatarOffsetY, isProtagonist: isProtagonist };
        project.characters.push(newCharacter);
        registerCharacterInLibrary(newCharacter);
        currentCharacter = name;
      } else {
        const char = project.characters.find(c => c.name === editingCharName);
        if (char) {
          if (name !== editingCharName && (project.characters.some(c => c.name === name) || name === '情景描写')) {
            alert("同じ名前のキャラクターが既に存在します。");
            characterSaveInProgress = false;
            return;
          }
          const previousCharacter = characterSnapshot(char);
          pushUndoSnapshot();

          project.talks.forEach(t => {
            if (t.charName === editingCharName) {
              t.charName = name;
              if (t.characterSnapshot?.name === editingCharName) {
                t.characterSnapshot = {
                  ...t.characterSnapshot,
                  name,
                  avatar: selectedAvatarBase64,
                  isRound,
                  zoom,
                  offsetX: avatarOffsetX,
                  offsetY: avatarOffsetY,
                  isProtagonist
                };
              }
            }
          });

          char.name = name;
          char.avatar = selectedAvatarBase64;
          char.isRound = isRound;
          char.isProtagonist = isProtagonist;
          char.zoom = zoom;
          char.offsetX = avatarOffsetX;
          char.offsetY = avatarOffsetY;
          updateCharacterLibraryAfterProjectEdit(previousCharacter, char);
          if (isProtagonist) {
            project.characters.forEach(c => {
              if (c !== char) c.isProtagonist = false;
            });
          }
          if (currentCharacter === editingCharName) {
            currentCharacter = name;
          }
        }
      }

      const anchor = captureTimelineViewport();
      renderCharSelector();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
      closeModal('charModal');
      saveState();
      setTimeout(() => { characterSaveInProgress = false; }, 0);
    }

    function isProtagonistTalk(project, charName) {
      const char = project.characters.find(c => c.name === charName);
      return !!char?.isProtagonist;
    }

    function characterSnapshot(character) {
      if (!character) return null;
      return {
        name: character.name || '',
        avatar: character.avatar || '',
        isRound: character.isRound !== false,
        zoom: Number(character.zoom) || 100,
        offsetX: character.offsetX ?? 50,
        offsetY: character.offsetY ?? 50,
        isProtagonist: !!character.isProtagonist
      };
    }

    function talkCharacterInfo(project, talk) {
      if (!talk || !project) return null;
      return project.characters.find(c => c.name === talk.charName) || talk.characterSnapshot || null;
    }

    function isTalkRight(project, talk) {
      const info = talkCharacterInfo(project, talk);
      return !!info?.isProtagonist;
    }

    function avatarHtmlForCharacterInfo(info, fallbackName) {
      if (info && info.avatar) {
        const radius = info.isRound !== false ? '50%' : '8px';
        const zoom = info.zoom || 100;
        const posX = info.offsetX ?? 50;
        const posY = info.offsetY ?? 50;
        return `<div class="avatar" style="border-radius:${radius}; background-image:url(${info.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
      }
      const short = fallbackName ? fallbackName.substring(0, 2) : "??";
      return `<div class="avatar-dummy">${escapeHtml(short)}</div>`;
    }

    function formatTalkNumber(index) { return String(index + 1).padStart(3, '0'); }

    function getStageDirection(talk) {
      return String(talk?.stageDirection || talk?.note || '').trim();
    }

    function stageDirectionDisplayHtml(talk) {
      const stageDirection = getStageDirection(talk);
      if (!stageDirection) return '';
      return '<div class="stage-direction-display">' + escapeHtml(stageDirection) + '</div>';
    }

    function scriptColorStorageKey() {
      return SCRIPTMAKER_SCRIPT_COLOR_PREFIX + (state.currentProjectId || 'default');
    }

    function sanitizeScriptColor(value) {
      return ['red', 'blue', 'green', 'yellow'].includes(value) ? value : '';
    }

    function scriptColorClassForCharacter(name) {
      const color = sanitizeScriptColor(editorScriptColorSettings[name] || '');
      return color ? ' script-color-' + color : '';
    }

    function loadEditorScriptColorSettings() {
      try {
        editorScriptColorSettings = JSON.parse(localStorage.getItem(scriptColorStorageKey()) || '{}') || {};
      } catch (error) {
        console.warn('Script color setting load failed', error);
        editorScriptColorSettings = {};
      }
    }

    function saveEditorScriptColorSettings() {
      localStorage.setItem(scriptColorStorageKey(), JSON.stringify(editorScriptColorSettings || {}));
      scheduleEditorBackupSync();
    }

    function scriptColorCharacterNames(project) {
      const names = new Set();
      const excluded = new Set(['情景描写', 'システム', '諠・勹謠丞・']);
      (project?.characters || []).forEach(character => {
        if (character?.name && !excluded.has(character.name)) names.add(character.name);
      });
      (project?.talks || []).forEach(talk => {
        if (talk?.charName && !excluded.has(talk.charName)) names.add(talk.charName);
      });
      return [...names];
    }

    function scriptColorSelectHtml(name, value) {
      const options = [
        ['', 'なし'],
        ['red', '\u8d64'],
        ['blue', '\u9752'],
        ['green', '\u7dd1'],
        ['yellow', '黄色']
      ];
      return '<select data-character="' + escapeHtml(name) + '">' + options.map(([color, label]) =>
        '<option value="' + color + '"' + (value === color ? ' selected' : '') + '>' + label + '</option>'
      ).join('') + '</select>';
    }

    function scriptColorAvatarHtml(project, name) {
      const info = project.characters.find(character => character.name === name) ||
        project.talks.find(talk => talk.charName === name && talk.characterSnapshot)?.characterSnapshot ||
        { name };
      if (info && info.avatar) {
        const radius = info.isRound !== false ? '50%' : '8px';
        const zoom = info.zoom || 100;
        const posX = info.offsetX ?? 50;
        const posY = info.offsetY ?? 50;
        return '<span class="script-color-avatar" style="border-radius:' + radius + ';background-image:url(' + info.avatar + ');background-size:' + zoom + '%;background-position:' + posX + '% ' + posY + '%"></span>';
      }
      return '<span class="script-color-avatar script-color-avatar-dummy">' + escapeHtml((name || '?').slice(0, 2)) + '</span>';
    }

    function renderScriptColorSettings() {
      const list = document.getElementById('scriptColorList');
      const project = state.projects[state.currentProjectId];
      if (!list || !project) return;
      loadEditorScriptColorSettings();
      const names = scriptColorCharacterNames(project);
      if (!names.length) {
        list.innerHTML = '<div class="script-color-empty">キャラクターがありません。</div>';
        return;
      }
      list.innerHTML = names.map(name => {
        const color = sanitizeScriptColor(editorScriptColorSettings[name] || '');
        return '<label class="script-color-item">' +
          '<span class="script-color-character">' +
            scriptColorAvatarHtml(project, name) +
            '<span class="script-color-name">' + escapeHtml(name) + '</span>' +
          '</span>' +
          scriptColorSelectHtml(name, color) +
        '</label>';
      }).join('');
      list.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
          const name = select.dataset.character;
          const color = sanitizeScriptColor(select.value);
          if (color) editorScriptColorSettings[name] = color;
          else delete editorScriptColorSettings[name];
          const anchor = captureTimelineViewport();
          saveEditorScriptColorSettings();
          renderTimeline();
          restoreTimelineViewport(anchor);
        });
      });
    }

    function openScriptColorModal() {
      renderScriptColorSettings();
      openModal('scriptColorModal');
    }

    function resetScriptColorSettings() {
      editorScriptColorSettings = {};
      const anchor = captureTimelineViewport();
      saveEditorScriptColorSettings();
      renderScriptColorSettings();
      renderTimeline();
      restoreTimelineViewport(anchor);
    }

    function initEditorDisplayModeControls() {
      document.querySelectorAll('input[name="editorDisplayMode"]').forEach(input => {
        input.checked = input.value === editorDisplayMode;
      });
      applyEditorDisplayModeClass();
      updateEditorOrientationHint(false);
    }

    function setEditorDisplayMode(mode) {
      editorDisplayMode = mode === 'script' ? 'script' : 'chat';
      const anchor = captureTimelineViewport();
      initEditorDisplayModeControls();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateEditorDesktopChatWallpaperFrame();
      applyProjectWallpaper(true);
      syncEditorOrientationForDisplayMode(true);
    }

    function isTouchScreenForOrientationLock() {
      return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    }

    function updateEditorOrientationHint(show) {
      document.getElementById('editorOrientationHint')?.classList.toggle('hidden', !show);
    }

    async function requestEditorFullscreenForOrientation() {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return true;
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        editorRequestedFullscreenForOrientation = true;
        return true;
      } catch (error) {
        console.warn('Fullscreen request before orientation lock failed', error);
        return false;
      }
    }

    function libraryAvatarHtml(character) {
      if (character.avatar) {
        const size = Number(character.zoom) || 100;
        const posX = character.offsetX ?? 50;
        const posY = character.offsetY ?? 50;
        return '<div class="character-library-avatar" style="background-image:url(' + character.avatar + ');background-size:' + size + '%;background-position:' + posX + '% ' + posY + '%;"></div>';
      }
      return '<div class="character-library-avatar">' + escapeHtml((character.name || '?').slice(0, 2)) + '</div>';
    }

    function openCharacterLibraryModal() {
      syncCharacterLibraryFromProjects();
      renderCharacterLibrary();
      openModal('charLibraryModal');
    }

    function renderCharacterLibrary() {
      const list = document.getElementById('characterLibraryList');
      const project = state.projects[state.currentProjectId];
      if (!list || !project) return;
      const library = loadCharacterLibrary();
      if (!library.length) {
        list.innerHTML = '<div class="character-library-empty">まだライブラリにキャラクターがありません。</div>';
        return;
      }
      list.innerHTML = '';
      library.forEach(character => {
        const signature = characterLibrarySignature(character);
        const isAdded = project.characters.some(item => item.name === character.name);
        const row = document.createElement('div');
        row.className = 'character-library-item' + (isAdded ? ' is-added' : '');
        row.dataset.signature = signature;
        row.innerHTML =
          libraryAvatarHtml(character) +
          '<button class="character-library-main" type="button">' +
            '<span class="character-library-name">' + escapeHtml(character.name) + '</span>' +
            '<span class="character-library-status">' + (isAdded ? '追加済み' : 'タップして追加') + '</span>' +
          '</button>' +
          '<button class="character-library-action" type="button">編集</button>' +
          '<button class="character-library-action character-library-delete" type="button">削除</button>';
        row.querySelector('.character-library-main').onclick = () => addCharacterFromLibrary(signature);
        row.querySelector('.character-library-action').onclick = () => openLibraryCharacterEdit(signature);
        row.querySelector('.character-library-delete').onclick = () => deleteLibraryCharacter(signature);
        row.oncontextmenu = event => {
          event.preventDefault();
          openLibraryCharacterEdit(signature);
        };
        list.appendChild(row);
      });
    }

    function findLibraryCharacter(signature) {
      return loadCharacterLibrary().find(item => characterLibrarySignature(item) === signature) || null;
    }

    function addCharacterFromLibrary(signature) {
      const character = findLibraryCharacter(signature);
      const project = state.projects[state.currentProjectId];
      if (!character || !project) return;
      const existing = project.characters.find(item => item.name === character.name);
      if (existing) {
        currentCharacter = existing.name;
        closeModal('charLibraryModal');
        renderCharSelector();
        return;
      }
      pushUndoSnapshot();
      const isProtagonist = !project.characters.some(item => item.isProtagonist);
      if (isProtagonist) project.characters.forEach(item => item.isProtagonist = false);
      project.characters.push(cloneLibraryCharacterForProject(character, isProtagonist));
      currentCharacter = character.name;
      const anchor = captureTimelineViewport();
      saveState();
      renderCharSelector();
      renderTimeline();
      restoreTimelineViewport(anchor);
      closeModal('charLibraryModal');
    }

    function deleteLibraryCharacter(signature) {
      const library = loadCharacterLibrary().filter(item => characterLibrarySignature(item) !== signature);
      saveCharacterLibrary(library);
      renderCharacterLibrary();
    }

    function openNewCharacterFromLibrary() {
      closeModal('charLibraryModal');
      openCharAddModal();
    }

    async function lockEditorLandscapeOrientation(fromUserGesture) {
      if (!isTouchScreenForOrientationLock()) {
        updateEditorOrientationHint(false);
        return;
      }
      if (!screen.orientation?.lock) {
        updateEditorOrientationHint(true);
        return;
      }
      try {
        await screen.orientation.lock('landscape');
        updateEditorOrientationHint(false);
        return;
      } catch (error) {
        console.warn('Landscape orientation lock failed', error);
      }
      if (fromUserGesture && await requestEditorFullscreenForOrientation()) {
        try {
          await screen.orientation.lock('landscape');
          updateEditorOrientationHint(false);
          return;
        } catch (error) {
          console.warn('Landscape orientation lock after fullscreen failed', error);
        }
      }
      updateEditorOrientationHint(true);
    }

    async function unlockEditorOrientation() {
      updateEditorOrientationHint(false);
      try {
        screen.orientation?.unlock?.();
      } catch (error) {
        console.warn('Orientation unlock failed', error);
      }
      if (editorRequestedFullscreenForOrientation && document.fullscreenElement && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (error) {
          console.warn('Exit fullscreen after orientation unlock failed', error);
        }
      }
      editorRequestedFullscreenForOrientation = false;
    }

    function syncEditorOrientationForDisplayMode(fromUserGesture = false) {
      if (editorDisplayMode === 'script') {
        lockEditorLandscapeOrientation(fromUserGesture);
      } else {
        unlockEditorOrientation();
      }
    }

    function applyEditorDisplayModeClass() {
      const editorView = document.getElementById('editorView');
      if (!editorView) return;
      editorView.classList.toggle('display-mode-script', editorDisplayMode === 'script');
      editorView.classList.toggle('display-mode-chat', editorDisplayMode !== 'script');
    }

    function sceneWallpaperForTalk(project, talk) {
      const settings = getSceneWallpaperSettings(project);
      if (settings?.enabled && talk?.id) {
        const scene = (settings.scenes || []).find(item => wallpaperHasImage(item) && Array.isArray(item.talkIds) && item.talkIds.includes(talk.id));
        if (scene) return scene;
      }
      return null;
    }

    function wallpaperStyle(wallpaper) {
      if (!wallpaper?.image) return '';
      const size = (wallpaper.size || 100) === 100 ? 'cover' : (wallpaper.size || 100) + '%';
      return 'background-image:url(' + wallpaper.image + ');background-size:' + size + ';background-position:' + (wallpaper.offsetX ?? 50) + '% ' + (wallpaper.offsetY ?? 50) + '%;';
    }

    function resolveScriptWallpaperImages(project) {
      document.querySelectorAll('.script-art-image[data-scene-id]').forEach(image => {
        const sceneId = image.dataset.sceneId;
        const scene = (getSceneWallpaperSettings(project).scenes || []).find(item => item.id === sceneId);
        if (!scene) return;
        resolveWallpaperUrl(scene).then(url => {
          if (!url) return;
          image.style.backgroundImage = 'url(' + url + ')';
          image.style.backgroundSize = 'contain';
          image.style.backgroundPosition = (scene.offsetX ?? 50) + '% ' + (scene.offsetY ?? 50) + '%';
        });
      });
    }
