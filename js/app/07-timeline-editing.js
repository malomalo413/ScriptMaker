// ScriptMaker Editor — トーク表示・編集・ト書き・文字数カウント
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    function isInteractiveTalkTarget(target) {
      return !!target?.closest?.('button, input, textarea, select, label, .stage-direction-display, .talk-edit-tools, .talk-edit-tools *, .talk-select');
    }

    function initTalkDoubleTapEdit(element, talkId) {
      if (!element || !talkId) return;
      const doubleTapMs = 360;
      const moveCancelThreshold = 10;
      const tapDistanceThreshold = 28;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let startScrollTop = 0;
      let cancelled = false;

      const cancel = () => {
        pointerId = null;
        cancelled = true;
      };

      element.addEventListener('pointerdown', event => {
        if (event.button != null && event.button !== 0) return;
        if (isEditMode || isSortingTalks || isInteractiveTalkTarget(event.target)) return;
        const timeline = document.getElementById('talkTimeline');
        cancelled = false;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startScrollTop = timeline ? timeline.scrollTop : 0;
      });

      element.addEventListener('pointermove', event => {
        if (pointerId !== event.pointerId) return;
        const timeline = document.getElementById('talkTimeline');
        const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
        const scrolled = timeline ? Math.abs(timeline.scrollTop - startScrollTop) : 0;
        if (moved > moveCancelThreshold || scrolled > 2) cancel();
      });

      element.addEventListener('pointerup', event => {
        if (pointerId !== null && event.pointerId != null && pointerId !== event.pointerId) return;
        const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
        const timeline = document.getElementById('talkTimeline');
        const scrolled = timeline ? Math.abs(timeline.scrollTop - startScrollTop) : 0;
        if (!cancelled && moved <= moveCancelThreshold && scrolled <= 2 && !isSortingTalks && Date.now() >= suppressTalkClickUntil) {
          const now = Date.now();
          const previous = talkDoubleTapState;
          const isDoubleTap = previous &&
            previous.talkId === talkId &&
            now - previous.time <= doubleTapMs &&
            Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= tapDistanceThreshold;
          if (isDoubleTap) {
            event.preventDefault();
            event.stopPropagation();
            talkDoubleTapState = null;
            suppressTalkClickUntil = Date.now() + 500;
            startInlineTalkEditById(talkId);
          } else {
            talkDoubleTapState = { talkId, time: now, x: event.clientX, y: event.clientY };
          }
        }
        cancel();
      });

      ['pointercancel', 'pointerleave'].forEach(type => {
        element.addEventListener(type, event => {
          if (pointerId !== null && event.pointerId != null && pointerId !== event.pointerId) return;
          cancel();
        });
      });

      element.addEventListener('click', event => {
        if (Date.now() < suppressTalkClickUntil) {
          event.preventDefault();
          event.stopPropagation();
        }
      });

      element.addEventListener('dblclick', event => {
        if (Date.now() < suppressTalkClickUntil || isEditMode || isSortingTalks || isInteractiveTalkTarget(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        suppressTalkClickUntil = Date.now() + 500;
        talkDoubleTapState = null;
        if (!isEditMode && !isSortingTalks && !isInteractiveTalkTarget(event.target)) {
          startInlineTalkEditById(talkId);
        }
      });
    }

    function renderScriptTimeline(project, timeline) {
      timeline.innerHTML = '';
      loadEditorScriptColorSettings();
      (project.talks || []).forEach((talk, index) => {
        if (!talk.id) talk.id = createTalkId();
        const scene = sceneWallpaperForTalk(project, talk);
        const row = document.createElement('article');
        row.className = 'script-row' + scriptColorClassForCharacter(talk.charName) + (editingTalkId === talk.id ? ' inline-edit-target' : '');
        row.dataset.index = index;
        row.dataset.talkId = talk.id;
        initTalkDoubleTapEdit(row, talk.id);
        row.innerHTML =
          '<div class="script-col script-dialogue">' +
            '<div class="script-meta"><span>' + formatTalkNumber(index) + '</span><strong>' + escapeHtml(talk.charName || '') + '</strong></div>' +
            '<div class="script-text">' + escapeHtml(talk.text || '') + '</div>' +
          '</div>' +
          '<div class="script-col script-stage">' + (getStageDirection(talk) ? escapeHtml(getStageDirection(talk)) : '') + '</div>' +
          '<div class="script-col script-art">' +
            (wallpaperHasImage(scene) ? '<div class="script-art-image" data-scene-id="' + scene.id + '" style="' + wallpaperStyle(scene) + '"></div><span>' + escapeHtml(scene.name || '') + '</span>' : '<div class="script-art-empty">壁紙なし</div>') +
          '</div>';
        timeline.appendChild(row);
      });
      resolveScriptWallpaperImages(project);
      updateSelectedTalkCount();
    }

    function renderTimeline() {
      if (isSortingTalks) {
        pendingTimelineRender = true;
        return;
      }

      const timeline = document.getElementById('talkTimeline');
      timeline.innerHTML = '';
      const project = state.projects[state.currentProjectId];
      if (!project) return;
      applyEditorDisplayModeClass();
      if (editorDisplayMode === 'script') {
        renderScriptTimeline(project, timeline);
        return;
      }

      // 1. 確定済みのトークを描画
      project.talks.forEach((talk, index) => {
        if (!talk.id) talk.id = createTalkId();
        const isScene = talk.charName === '情景描写';
        const isRight = isTalkRight(project, talk) && !isScene;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isScene ? 'scene' : (isRight ? 'right' : 'left')}${editingTalkId === talk.id ? ' inline-edit-target' : ''}`;
        if (state.settings?.showTalkNumbers !== false) bubble.classList.add('with-number');
        bubble.dataset.index = index;
        bubble.dataset.talkId = talk.id;

        initTalkDoubleTapEdit(bubble, talk.id);

        let avatarHtml = '';
        if (!isScene) avatarHtml = avatarHtmlForCharacterInfo(talkCharacterInfo(project, talk), talk.charName);

        bubble.innerHTML = `
          <input type="checkbox" class="talk-select" ${selectedTalkIndexes.has(index) ? 'checked' : ''} onclick="toggleTalkSelection(event, ${index})">
          ${state.settings?.showTalkNumbers !== false ? '<span class="talk-number">' + formatTalkNumber(index) + '</span>' : ''}
          ${avatarHtml}
          <div class="bubble-content">
            <span class="char-name">${escapeHtml(talk.charName)}</span>
            <div class="message-text">${escapeHtml(talk.text || '')}</div>
            ${stageDirectionDisplayHtml(talk)}
            <button type="button" class="talk-tools-toggle" onclick="toggleTalkTools(event, this)" aria-label="このセリフの操作">&#8943; 操作</button>
            <div class="talk-edit-tools" onclick="event.stopPropagation()">
              <button onclick="moveTalk(event, ${index}, -1)">↑</button>
              <button onclick="moveTalk(event, ${index}, 1)">↓</button>
              <button onclick="openStageDirectionEditor(event, ${index})">ト書き</button>
              <button onclick="duplicateTalk(event, ${index})">複製</button>
              <button class="btn-talk-delete" onclick="deleteTalk(event, ${index})">削除</button>
            </div>
          </div>
        `;
        timeline.appendChild(bubble);
      });
      
      updateSelectedTalkCount();
      scheduleSceneWallpaperUpdate();
    }

    function sendMessage() {
      const input = document.getElementById('inputSpeech');
      const text = input.value.trim();
      if (!text) return;

      const project = state.projects[state.currentProjectId];
      if (!project) return;

      if (editingTalkId !== null) {
        const resolved = talkById(editingTalkId);
        if (!resolved) {
          cancelInlineTalkEdit();
          return;
        }
        const anchor = captureTalkViewportAnchor(editingTalkId);
        pushUndoSnapshot();
        const prepared = prepareTalkInputForSave(currentCharacter, text, getStageDirection(resolved.talk));
        project.talks[resolved.index] = { ...resolved.talk, charName: currentCharacter, text: prepared.text };
        if (prepared.stageDirection) {
          project.talks[resolved.index].stageDirection = prepared.stageDirection;
        } else {
          delete project.talks[resolved.index].stageDirection;
          delete project.talks[resolved.index].note;
        }
        saveState();
        finishInlineTalkEdit();
        renderTimeline();
        updateMetaStats();
        restoreTalkViewportAnchor(anchor);
        return;
      }

      if (insertTalkTarget?.talkId) {
        const target = talkById(insertTalkTarget.talkId);
        if (!target) {
          cancelInlineTalkEdit();
          return;
        }
        const anchor = captureTalkViewportAnchor(insertTalkTarget.talkId);
        pushUndoSnapshot();
        const prepared = prepareTalkInputForSave(currentCharacter, text, inputStageDirectionDraft);
        const insertedTalk = createTalkRecord(currentCharacter, prepared.text, prepared.stageDirection);
        const insertIndex = insertTalkTarget.position === 'before' ? target.index : target.index + 1;
        project.talks.splice(insertIndex, 0, insertedTalk);
        saveState();
        finishInlineTalkEdit();
        renderTimeline();
        updateMetaStats();
        restoreTalkViewportAnchor({ ...anchor, talkId: insertedTalk.id });
        return;
      }

      pushUndoSnapshot();
      const prepared = prepareTalkInputForSave(currentCharacter, text, inputStageDirectionDraft);
      project.talks.push(createTalkRecord(currentCharacter, prepared.text, prepared.stageDirection));

      saveState();
      renderTimeline();
      updateMetaStats();
      clearInputSpeech();
      scrollToBottom();
    }

    function sendMessageOnEnter(e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      sendMessage();
    }

    function openEditTalkModal(index) {
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      startInlineTalkEditById(talk?.id);
    }

    function talkIndexById(talkId) {
      const project = state.projects[state.currentProjectId];
      if (!project || !talkId) return -1;
      return project.talks.findIndex(talk => talk.id === talkId);
    }

    function talkById(talkId) {
      const project = state.projects[state.currentProjectId];
      const index = talkIndexById(talkId);
      return index >= 0 ? { talk: project.talks[index], index } : null;
    }

    function setEditingTalkTarget(talkId) {
      const resolved = talkById(talkId);
      if (!resolved) {
        editingTalkId = null;
        editingTalkIndex = null;
        return null;
      }
      editingTalkId = resolved.talk.id;
      editingTalkIndex = resolved.index;
      return resolved;
    }

    function startInlineTalkEdit(index) {
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      startInlineTalkEditById(talk?.id);
    }

    function startInlineTalkEditById(talkId) {
      const resolved = setEditingTalkTarget(talkId);
      if (!resolved) return;

      const talk = resolved.talk;
      const timeline = document.getElementById('talkTimeline');
      const previousScrollTop = timeline ? timeline.scrollTop : 0;
      const anchor = captureTalkViewportAnchor(talk.id) || { talkId: talk.id, scrollTop: previousScrollTop };
      insertTalkTarget = null;
      inputStageDirectionDraft = '';
      currentCharacter = talk.charName;
      const input = document.getElementById('inputSpeech');
      input.value = talk.text;
      resizeInputSpeech(input);
      renderInputStageDirectionHighlight();
      updateInlineEditState();
      renderCharSelector();
      renderTimeline();
      restoreTimelineViewport(anchor);
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }

    function startInsertBeforeEditingTalk() {
      if (!editingTalkId) return;
      startInsertTalkById(editingTalkId, 'before');
    }

    function startInsertAfterEditingTalk() {
      if (!editingTalkId) return;
      startInsertTalkById(editingTalkId, 'after');
    }

    function startInsertTalkById(talkId, position) {
      const resolved = talkById(talkId);
      if (!resolved) return;
      const timeline = document.getElementById('talkTimeline');
      const anchor = captureTalkViewportAnchor(talkId);
      insertTalkTarget = { talkId, position: position === 'before' ? 'before' : 'after' };
      editingTalkId = null;
      editingTalkIndex = null;
      inputStageDirectionDraft = '';
      currentCharacter = resolved.talk.charName || currentCharacter;
      clearInputSpeech();
      updateInlineEditState();
      renderCharSelector();
      renderTimeline();
      restoreTalkViewportAnchor(anchor || { talkId, scrollTop: timeline ? timeline.scrollTop : 0 });
      const input = document.getElementById('inputSpeech');
      setTimeout(() => input?.focus({ preventScroll: true }), 0);
    }

    function talkViewportItems(excludeTalkIds = null) {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline) return [];
      const excludes = excludeTalkIds instanceof Set ? excludeTalkIds : new Set(excludeTalkIds || []);
      return Array.from(timeline.querySelectorAll('[data-talk-id]')).filter(item => item.dataset.talkId && !excludes.has(item.dataset.talkId));
    }

    function captureTimelineViewport(preferredTalkId = '', options = {}) {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline) return null;
      const items = talkViewportItems(options.excludeTalkIds);
      let target = preferredTalkId ? items.find(item => item.dataset.talkId === preferredTalkId) : null;
      if (!target) {
        const timelineRect = timeline.getBoundingClientRect();
        const anchorY = timelineRect.top + 8;
        target = items
          .filter(item => {
            const rect = item.getBoundingClientRect();
            return rect.bottom >= timelineRect.top && rect.top <= timelineRect.bottom;
          })
          .sort((a, b) => Math.abs(a.getBoundingClientRect().top - anchorY) - Math.abs(b.getBoundingClientRect().top - anchorY))[0];
      }
      if (!target) return { scrollTop: timeline.scrollTop };
      return {
        talkId: target.dataset.talkId,
        scrollTop: timeline.scrollTop,
        top: target.getBoundingClientRect().top
      };
    }

    function captureTalkViewportAnchor(talkId) {
      return captureTimelineViewport(talkId);
    }

    function captureMutationViewportAnchor(indexesToRemove = []) {
      const project = state.projects[state.currentProjectId];
      const removeIndexes = new Set(indexesToRemove.filter(index => Number.isInteger(index)));
      const removeIds = new Set((project?.talks || []).filter((_, index) => removeIndexes.has(index)).map(talk => talk.id).filter(Boolean));
      const visibleAnchor = captureTimelineViewport('', { excludeTalkIds: removeIds });
      if (visibleAnchor?.talkId) return visibleAnchor;
      if (!project) return visibleAnchor;
      const sorted = [...removeIndexes].sort((a, b) => a - b);
      const first = sorted[0] ?? 0;
      const last = sorted[sorted.length - 1] ?? first;
      const nextTalk = project.talks.slice(last + 1).find(talk => talk?.id && !removeIds.has(talk.id));
      if (nextTalk) return captureTalkViewportAnchor(nextTalk.id) || { talkId: nextTalk.id, scrollTop: visibleAnchor?.scrollTop };
      for (let i = first - 1; i >= 0; i--) {
        const talk = project.talks[i];
        if (talk?.id && !removeIds.has(talk.id)) return captureTalkViewportAnchor(talk.id) || { talkId: talk.id, scrollTop: visibleAnchor?.scrollTop };
      }
      return visibleAnchor;
    }

    function restoreTimelineViewport(anchor) {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline || !anchor) return;
      activeViewportAnchor = anchor;
      preserveViewportAfterEdit = true;
      scheduleViewportPreserveRelease();
      const restore = () => {
        const target = Array.from(timeline.querySelectorAll('[data-talk-id]')).find(item => item.dataset.talkId === anchor.talkId);
        if (target && Number.isFinite(anchor.top)) {
          const nextTop = target.getBoundingClientRect().top;
          timeline.scrollTop += nextTop - anchor.top;
        } else if (Number.isFinite(anchor.scrollTop)) {
          timeline.scrollTop = anchor.scrollTop;
        }
      };
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    }

    function restoreTalkViewportAnchor(anchor) {
      restoreTimelineViewport(anchor);
    }

    function restoreActiveViewportAnchor() {
      if (!preserveViewportAfterEdit || !activeViewportAnchor) return;
      const anchor = activeViewportAnchor;
      const timeline = document.getElementById('talkTimeline');
      if (!timeline) return;
      requestAnimationFrame(() => {
        const target = Array.from(timeline.querySelectorAll('[data-talk-id]')).find(item => item.dataset.talkId === anchor.talkId);
        if (target && Number.isFinite(anchor.top)) {
          timeline.scrollTop += target.getBoundingClientRect().top - anchor.top;
        } else if (Number.isFinite(anchor.scrollTop)) {
          timeline.scrollTop = anchor.scrollTop;
        }
      });
    }

    function scheduleViewportPreserveRelease() {
      if (viewportPreserveReleaseTimer) clearTimeout(viewportPreserveReleaseTimer);
      viewportPreserveReleaseTimer = setTimeout(() => {
        const viewport = window.visualViewport;
        const currentHeight = Math.floor(viewport ? viewport.height : window.innerHeight);
        const heightStable = Math.abs(currentHeight - lastViewportLayoutHeight) <= 2;
        const keyboardActive = document.body.classList.contains('keyboard-focused') || document.body.classList.contains('keyboard-open');
        if (!keyboardActive && heightStable) {
          preserveViewportAfterEdit = false;
          activeViewportAnchor = null;
          return;
        }
        lastViewportLayoutHeight = currentHeight;
        scheduleViewportPreserveRelease();
      }, 180);
    }

    function finishInlineTalkEdit() {
      editingTalkIndex = null;
      editingTalkId = null;
      insertTalkTarget = null;
      clearInputSpeech();
      updateInlineEditState();
    }

    function cancelInlineTalkEdit() {
      const anchor = captureTimelineViewport(editingTalkId || insertTalkTarget?.talkId || '');
      editingTalkIndex = null;
      editingTalkId = null;
      insertTalkTarget = null;
      clearInputSpeech();
      updateInlineEditState();
      renderTimeline();
      restoreTimelineViewport(anchor);
    }

    function clearInputSpeech() {
      const input = document.getElementById('inputSpeech');
      input.value = '';
      input.style.height = '42px';
      inputStageDirectionDraft = '';
      renderInputStageDirectionHighlight();
    }

    function resizeInputSpeech(input) {
      input.style.height = '42px';
      let newHeight = input.scrollHeight;
      if (newHeight < 42) newHeight = 42;
      if (newHeight > 120) newHeight = 120;
      input.style.height = newHeight + 'px';
      syncInputHighlightLayer(input);
    }

    function syncInputHighlightLayer(input) {
      const highlight = document.getElementById('inputSpeechHighlight');
      if (!input || !highlight) return;
      highlight.style.height = input.style.height || input.offsetHeight + 'px';
      highlight.scrollTop = input.scrollTop;
      highlight.scrollLeft = input.scrollLeft;
    }

    function renderInputStageDirectionHighlight() {
      const input = document.getElementById('inputSpeech');
      const highlight = document.getElementById('inputSpeechHighlight');
      if (!input || !highlight) return;
      const value = input.value || '';
      const ranges = currentCharacter === '情景描写' ? [] : findTrailingStageDirectionRanges(value, { fullWidthOnly: true }).ranges;
      if (!value) {
        highlight.innerHTML = '';
        syncInputHighlightLayer(input);
        return;
      }

      let html = '';
      let cursor = 0;
      ranges.forEach(range => {
        html += escapeHtml(value.slice(cursor, range.start));
        html += '<span class="input-stage-highlight">' + escapeHtml(value.slice(range.start, range.end)) + '</span>';
        cursor = range.end;
      });
      html += escapeHtml(value.slice(cursor));
      if (value.endsWith('\n')) html += ' ';
      highlight.innerHTML = html;
      syncInputHighlightLayer(input);
    }

    function updateInlineEditState() {
      const status = document.getElementById('inlineEditStatus');
      const sendButton = document.getElementById('sendButton');
      const label = document.getElementById('inlineEditLabel');
      const insertBeforeButton = document.getElementById('insertBeforeButton');
      const insertAfterButton = document.getElementById('insertAfterButton');
      const cancelButton = document.getElementById('inlineCancelButton');
      if (!status || !sendButton) return;
      const isEditing = editingTalkId !== null && talkIndexById(editingTalkId) >= 0;
      const isInserting = !!(insertTalkTarget?.talkId && talkIndexById(insertTalkTarget.talkId) >= 0);
      if (isEditing) editingTalkIndex = talkIndexById(editingTalkId);
      status.classList.toggle('hidden', !isEditing && !isInserting);
      document.body.classList.toggle('inline-talk-editing', isEditing || isInserting);
      sendButton.innerText = isEditing ? '更新' : (isInserting ? '挿入' : '送信');
      if (label) {
        if (isEditing) {
          label.textContent = formatTalkNumber(editingTalkIndex) + '番を編集中';
        } else if (isInserting) {
          const index = talkIndexById(insertTalkTarget.talkId);
          label.textContent = formatTalkNumber(index) + '番の' + (insertTalkTarget.position === 'before' ? '\u524d' : '\u5f8c') + 'へ挿入中';
        } else {
          label.textContent = '';
        }
      }
      if (insertBeforeButton) insertBeforeButton.classList.toggle('hidden', !isEditing);
      if (insertAfterButton) insertAfterButton.classList.toggle('hidden', !isEditing);
      if (cancelButton) cancelButton.textContent = isInserting ? '挿入をキャンセル' : 'キャンセル';
    }

    function confirmEditTalk() {
      sendMessage();
    }

    function toggleEditMode() {
      const anchor = captureTimelineViewport();
      isEditMode = !isEditMode;
      const btn = document.getElementById('modeToggleBtn');
      if (isEditMode) {
        btn.innerText = '終了';
        btn.classList.add('editing');
        document.body.classList.add('edit-mode-active');
      } else {
        btn.innerText = '編集';
        btn.classList.remove('editing');
        document.body.classList.remove('edit-mode-active');
        selectedTalkIndexes.clear();
      }
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateSelectedTalkCount();
    }

    function toggleTalkSelection(event, index) {
      event.stopPropagation();
      if (event.target.checked) {
        selectedTalkIndexes.add(index);
      } else {
        selectedTalkIndexes.delete(index);
      }
      updateSelectedTalkCount();
    }

    function updateSelectedTalkCount() {
      const countEl = document.getElementById('selectedTalkCount');
      if (!countEl) return;
      countEl.innerText = `${selectedTalkIndexes.size}件選択中`;
      updateSelectedTalkRangeHighlight();
    }

    function clearTalkSelection() {
      const anchor = captureTimelineViewport();
      selectedTalkIndexes.clear();
      renderTimeline();
      restoreTimelineViewport(anchor);
    }

    function deleteSelectedTalks() {
      if (selectedTalkIndexes.size === 0) return;
      const project = state.projects[state.currentProjectId];
      const anchor = captureMutationViewportAnchor([...selectedTalkIndexes]);
      const removedIds = project.talks.filter((_, index) => selectedTalkIndexes.has(index)).map(talk => talk.id).filter(Boolean);
      pushUndoSnapshot();
      project.talks = project.talks.filter((_, index) => !selectedTalkIndexes.has(index));
      removeTalkIdsFromSceneSettings(project, removedIds);
      if (editingTalkId && removedIds.includes(editingTalkId)) {
        editingTalkId = null;
        editingTalkIndex = null;
        clearInputSpeech();
      }
      selectedTalkIndexes.clear();
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
    }

    function deleteTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const anchor = captureMutationViewportAnchor([index]);
      pushUndoSnapshot();
      const removed = project.talks[index];
      project.talks.splice(index, 1);
      removeTalkIdsFromSceneSettings(project, removed?.id ? [removed.id] : []);
      if (removed?.id && removed.id === editingTalkId) {
        editingTalkId = null;
        editingTalkIndex = null;
        clearInputSpeech();
      }
      normalizeSelectedTalksAfterMutation();
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
    }

    function openStageDirectionEditor(event, index) {
      event?.stopPropagation?.();
      const project = state.projects[state.currentProjectId];
      const talk = project?.talks?.[index];
      if (!talk) return;
      const textarea = document.getElementById('stageDirectionText');
      const target = document.getElementById('stageDirectionTarget');
      const label = document.getElementById('stageDirectionTalkLabel');
      stageDirectionViewportAnchor = captureTalkViewportAnchor(talk.id);
      if (target) target.value = String(index);
      if (textarea) {
        textarea.value = getStageDirection(talk);
        setTimeout(() => {
          textarea.focus({ preventScroll: true });
          const end = textarea.value.length;
          textarea.setSelectionRange(end, end);
        }, 50);
      }
      if (label) label.textContent = formatTalkNumber(index) + ' ' + (talk.charName || '') + ': ' + (talk.text || '').slice(0, 32);
      openModal('stageDirectionModal');
    }

    function openCurrentStageDirectionEditor() {
      if (insertTalkTarget?.talkId) {
        openInputStageDirectionEditor();
        return;
      }
      const index = talkIndexById(editingTalkId);
      if (index < 0) return;
      openStageDirectionEditor({ stopPropagation() {} }, index);
    }

    function openInputStageDirectionEditor() {
      const textarea = document.getElementById('stageDirectionText');
      const target = document.getElementById('stageDirectionTarget');
      const label = document.getElementById('stageDirectionTalkLabel');
      stageDirectionViewportAnchor = captureTimelineViewport(insertTalkTarget?.talkId || editingTalkId || '');
      if (target) target.value = '__inputDraft';
      if (textarea) {
        textarea.value = inputStageDirectionDraft;
        setTimeout(() => {
          textarea.focus({ preventScroll: true });
          const end = textarea.value.length;
          textarea.setSelectionRange(end, end);
        }, 50);
      }
      if (label) label.textContent = '挿入するセリフのト書き';
      openModal('stageDirectionModal');
    }

    function saveStageDirection() {
      const project = state.projects[state.currentProjectId];
      const targetValue = document.getElementById('stageDirectionTarget')?.value || '';
      if (targetValue === '__inputDraft') {
        inputStageDirectionDraft = (document.getElementById('stageDirectionText')?.value || '').trim();
        closeModal('stageDirectionModal');
        updateInlineEditState();
        return;
      }
      const index = parseInt(targetValue, 10);
      const talk = project?.talks?.[index];
      if (!talk) return;
      const anchor = captureTalkViewportAnchor(talk.id) || stageDirectionViewportAnchor;
      const value = (document.getElementById('stageDirectionText')?.value || '').trim();
      pushUndoSnapshot();
      if (value) {
        talk.stageDirection = value;
      } else {
        delete talk.stageDirection;
        delete talk.note;
      }
      saveState();
      closeModal('stageDirectionModal');
      renderTimeline();
      restoreTimelineViewport(anchor);
    }

    function duplicateTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const original = project.talks[index];
      if (!original) return;
      const anchor = captureTalkViewportAnchor(original.id) || captureTimelineViewport();
      pushUndoSnapshot();
      project.talks.splice(index + 1, 0, createTalkRecord(original.charName, original.text, getStageDirection(original)));
      selectedTalkIndexes.clear();
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
    }

    function moveTalk(event, index, direction) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= project.talks.length) return;
      const anchor = captureTimelineViewport(project.talks[index]?.id || '');

      pushUndoSnapshot();
      const [talk] = project.talks.splice(index, 1);
      project.talks.splice(targetIndex, 0, talk);
      selectedTalkIndexes.clear();
      selectedTalkIndexes.add(targetIndex);
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
    }

    function normalizeSelectedTalksAfterMutation() {
      const project = state.projects[state.currentProjectId];
      selectedTalkIndexes = new Set([...selectedTalkIndexes].filter(index => index < project.talks.length));
    }

    function initCountControls() {
      const punctuationCheck = document.getElementById('excludePunctuationCheck');
      const customCheck = document.getElementById('excludeCustomCheck');
      const emojiCheck = document.getElementById('excludeEmojiCheck');
      const customInput = document.getElementById('customExcludeChars');
      const showNumbers = document.getElementById('showTalkNumbersCheck');
      const outputNumbers = document.getElementById('outputTalkNumbersCheck');
      const countOptions = document.getElementById('countOptionsDetails');
      const storedCountSetting = loadEditorCountSetting();
      if (emojiCheck) emojiCheck.checked = !!storedCountSetting.excludeEmoji;
      if (showNumbers) showNumbers.checked = state.settings?.showTalkNumbers !== false;
      if (outputNumbers) outputNumbers.checked = !!state.settings?.outputTalkNumbers;
      if (countOptions) {
        countOptions.open = !!storedCountSetting.countOptionsOpen;
        countOptions.addEventListener('toggle', function() {
          saveEditorCountSetting({ countOptionsOpen: this.open });
        });
      }
      [punctuationCheck, customCheck].forEach(el => { el?.addEventListener('change', updateMetaStats); });
      emojiCheck?.addEventListener('change', function() {
        saveEditorCountSetting({ excludeEmoji: this.checked });
        updateMetaStats();
      });
      customInput?.addEventListener('input', updateMetaStats);
    }

    function initNumberSettingsControls() {
      const showNumbers = document.getElementById('showTalkNumbersCheck');
      const outputNumbers = document.getElementById('outputTalkNumbersCheck');
      if (showNumbers) showNumbers.addEventListener('change', function() { const anchor = captureTimelineViewport(); state.settings.showTalkNumbers = this.checked; saveState(); renderTimeline(); restoreTimelineViewport(anchor); });
      if (outputNumbers) outputNumbers.addEventListener('change', function() { state.settings.outputTalkNumbers = this.checked; saveState(); });
    }

    function loadEditorCountSetting() {
      try {
        return JSON.parse(localStorage.getItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY) || '{}') || {};
      } catch (error) {
        console.warn('Editor count setting load failed', error);
        return {};
      }
    }

    function saveEditorCountSetting(next) {
      const current = loadEditorCountSetting();
      localStorage.setItem(SCRIPTMAKER_EDITOR_COUNT_SETTING_KEY, JSON.stringify({ ...current, ...next }));
      scheduleEditorBackupSync();
    }

    function isCountableTalk(talk) {
      return talk?.charName !== '情景描写' && talk?.charName !== 'システム';
    }

    function removeEmojiLikeChars(text) {
      return String(text || '').replace(/\p{Extended_Pictographic}[\uFE0F\uFE0E]?(?:\u200D\p{Extended_Pictographic}[\uFE0F\uFE0E]?)*|\p{Emoji_Presentation}/gu, '');
    }

    function getCountedText(text) {
      let result = text || "";
      const excludePunctuation = document.getElementById('excludePunctuationCheck')?.checked;
      const excludeCustom = document.getElementById('excludeCustomCheck')?.checked;
      const excludeEmoji = document.getElementById('excludeEmojiCheck')?.checked;
      const customChars = document.getElementById('customExcludeChars')?.value || "";

      if (excludePunctuation) {
        result = result.replace(/[、。,.，．！？!?「」『』（）()［］\[\]｛｝{}【】・…:：;；"'“”‘’\-〜～]/g, "");
      }

      if (excludeCustom && customChars) {
        const customSet = new Set([...customChars]);
        result = [...result].filter(ch => !customSet.has(ch)).join("");
      }

      if (excludeEmoji) {
        result = removeEmojiLikeChars(result);
      }

      return result;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[ch]));
    }

    function updateMetaStats() {
      const project = state.projects[state.currentProjectId];
      const output = document.getElementById('countOutput');
      if (!project) return;

      const counts = {};
      let total = 0;
      project.talks.filter(isCountableTalk).forEach(t => {
        const count = [...getCountedText(t.text)].length;
        total += count;
        counts[t.charName] = (counts[t.charName] || 0) + count;
      });

      const breakdown = Object.entries(counts)
        .map(([name, count]) => `<span>${escapeHtml(name)}: ${count}文字</span>`)
        .join("");

      output.innerHTML = `
        <div class="count-total">合計文字数: ${total}文字</div>
        <div class="count-breakdown">${breakdown || '<span>キャラクター別: 0文字</span>'}</div>
      `;
    }

    function scrollToBottom() {
      const timeline = document.getElementById('talkTimeline');
      timeline.scrollTop = timeline.scrollHeight;
    }

    function keepEditingTalkVisible() {
      const timeline = document.getElementById('talkTimeline');
      if (!timeline || !editingTalkId) return false;
      const target = Array.from(timeline.querySelectorAll('[data-talk-id]')).find(item => item.dataset.talkId === editingTalkId);
      if (!target) return false;

      const targetTop = target.offsetTop;
      const targetBottom = targetTop + target.offsetHeight;
      const visibleTop = timeline.scrollTop + 8;
      const visibleBottom = timeline.scrollTop + timeline.clientHeight - 8;

      if (targetTop < visibleTop) {
        timeline.scrollTop = Math.max(0, targetTop - 12);
      } else if (targetBottom > visibleBottom) {
        timeline.scrollTop += targetBottom - visibleBottom + 12;
      }
      return true;
    }

    function scrollTimelineForKeyboard() {
      if (keepEditingTalkVisible()) return;
    }
