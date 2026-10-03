// ScriptMaker Editor — ドラッグ操作・キーボード対応・メニュー・起動処理
// js/app.js を機能ごとに分割したファイルです。読み込み順は index.html の <script> の順番どおりにしてください。

    /* ==========================================
       👑 ドラッグ＆ドロップ削除設定
       ========================================== */
    function initSortableDragAndTrash() {
      if (typeof Sortable === 'undefined') {
        console.warn('SortableJS is not loaded. Drag delete is disabled.');
        return;
      }

      const timeline = document.getElementById('talkTimeline');
      const trashZone = document.getElementById('trashZone');
      let draggingItem = null;

      if (timeline._sortable) {
        timeline._sortable.destroy();
      }

      timeline._sortable = Sortable.create(timeline, {
        animation: 180,
        draggable: '.chat-bubble',
        filter: '.talk-select, .talk-edit-tools, .talk-edit-tools *',
        preventOnFilter: false,
        delay: 400,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        fallbackTolerance: 4,
        fallbackOnBody: true,
        forceFallback: true,
        ghostClass: 'talk-sortable-ghost',
        chosenClass: 'talk-sortable-chosen',
        dragClass: 'talk-sortable-drag',
        swapThreshold: 0.65,
        invertSwap: false,

        onStart: function(evt) {
          isSortingTalks = true;
          pendingTimelineRender = false;
          draggingItem = evt.item;
          if (draggingItem) lockDragShape(draggingItem);
          document.body.classList.add('talk-sorting-active');
          trashZone.classList.add('visible');
        },

        onMove: function(evt, originalEvent) {
          updateDragShrink(originalEvent, trashZone, draggingItem);
          return true;
        },

        onEnd: function(evt) {
          const item = draggingItem || evt.item;
          resetDragShrink(item);
          draggingItem = null;
          document.body.classList.remove('talk-sorting-active');
          trashZone.classList.remove('visible');
          trashZone.classList.remove('hover');
          isSortingTalks = false;
          suppressTalkClickUntil = Date.now() + 350;

          if (deleteDraggedTalkIfOverTrash(evt, trashZone, item)) {
            pendingTimelineRender = false;
            return;
          }

          const project = state.projects[state.currentProjectId];
          if (!project) return;

          const oldIndex = getTalkIndexFromItem(item);
          const newIndex = getSortableTalkIndex(evt);
          const anchor = captureTimelineViewport(project.talks?.[oldIndex]?.id || '');
          if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex < 0 || oldIndex >= project.talks.length) {
            pendingTimelineRender = false;
            renderTimeline();
            restoreTimelineViewport(anchor);
            return;
          }

          if (oldIndex !== newIndex) {
            pushUndoSnapshot();
            const [movedTalk] = project.talks.splice(oldIndex, 1);
            const safeNewIndex = Math.max(0, Math.min(newIndex, project.talks.length));
            project.talks.splice(safeNewIndex, 0, movedTalk);
            saveState();
            updateMetaStats();
          }

          pendingTimelineRender = false;
          renderTimeline();
          restoreTimelineViewport(anchor);
        }
      });
    }

    function getTalkIndexFromItem(item) {
      if (!item) return NaN;
      const index = Number.parseInt(item.dataset.index, 10);
      return Number.isNaN(index) ? NaN : index;
    }

    function getSortableTalkIndex(evt) {
      if (Number.isInteger(evt.newDraggableIndex)) return evt.newDraggableIndex;
      if (Number.isInteger(evt.newIndex)) {
        const timelineItems = Array.from(document.querySelectorAll('#talkTimeline .chat-bubble'));
        return timelineItems.indexOf(evt.item);
      }
      return NaN;
    }

    function deleteDraggedTalkIfOverTrash(evt, trashZone, item) {
      if (!item || !isPointerOverTrash(evt.originalEvent, trashZone)) return false;
      return deleteDraggedTalkByItem(item);
    }

    function deleteDraggedTalkByItem(item) {
      const idx = parseInt(item.dataset.index);
      if (Number.isNaN(idx) || idx < 0) return false;

      const project = state.projects[state.currentProjectId];
      if (!project || idx >= project.talks.length) return false;

      item.dataset.deletedByTrash = 'true';
      const anchor = captureMutationViewportAnchor([idx]);
      pushUndoSnapshot();
      const removed = project.talks[idx];
      project.talks.splice(idx, 1);
      removeTalkIdsFromSceneSettings(project, removed?.id ? [removed.id] : []);
      saveState();
      renderTimeline();
      restoreTimelineViewport(anchor);
      updateMetaStats();
      return true;
    }

    function isPointerOverTrash(pointerEvent, trashZone) {
      const point = getPointerPoint(pointerEvent);
      if (!point) return false;

      const rect = trashZone.getBoundingClientRect();
      const padding = 24;
      return point.clientX >= rect.left - padding &&
        point.clientX <= rect.right + padding &&
        point.clientY >= rect.top - padding &&
        point.clientY <= rect.bottom + padding;
    }

    function lockDragShape(item) {
      const rect = item.getBoundingClientRect();
      item.dataset.dragWidth = item.style.width || "";
      item.dataset.dragMinWidth = item.style.minWidth || "";
      item.dataset.dragMaxWidth = item.style.maxWidth || "";

      item.classList.add('drag-shrinking');
      item.style.width = `${rect.width}px`;
      item.style.minWidth = `${rect.width}px`;
      item.style.maxWidth = 'none';
    }

    function updateDragShrink(pointerEvent, trashZone, item) {
      if (!pointerEvent || !item) return;
      const point = getPointerPoint(pointerEvent);
      if (!point) return;

      const rect = trashZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = point.clientX - centerX;
      const dy = point.clientY - centerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const shrinkRange = 170;
      const proximity = Math.max(0, Math.min(1, 1 - distance / shrinkRange));
      const scale = 1 - proximity * 0.72;

      item.style.transform = `scale(${scale})`;
      item.style.opacity = String(1 - proximity * 0.35);
      trashZone.classList.toggle('hover', proximity > 0.55);
    }

    function getPointerPoint(event) {
      if (typeof event.clientX === 'number') return event;
      if (event.touches && event.touches.length > 0) return event.touches[0];
      if (event.changedTouches && event.changedTouches.length > 0) return event.changedTouches[0];
      return null;
    }

    function resetDragShrink(item) {
      if (!item) return;
      item.classList.remove('drag-shrinking');
      item.style.transform = '';
      item.style.opacity = '';
      item.style.width = item.dataset.dragWidth || '';
      item.style.minWidth = item.dataset.dragMinWidth || '';
      item.style.maxWidth = item.dataset.dragMaxWidth || '';
      delete item.dataset.dragWidth;
      delete item.dataset.dragMinWidth;
      delete item.dataset.dragMaxWidth;
    }

    /* ==========================================
       ⌨ 環境自動判定型・キーボード対策
       ========================================== */
    function initKeyboardAvoidance() {
      const inputSpeech = document.getElementById('inputSpeech');
      const trashZone = document.getElementById('trashZone');
      const timeline = document.getElementById('talkTimeline');

      inputSpeech.addEventListener('keydown', sendMessageOnEnter);
      inputSpeech.addEventListener('scroll', () => syncInputHighlightLayer(inputSpeech));
      inputSpeech.addEventListener('compositionupdate', () => renderInputStageDirectionHighlight());
      inputSpeech.addEventListener('compositionend', () => renderInputStageDirectionHighlight());

      originalViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      renderInputStageDirectionHighlight();
      forceResizeViewport();

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', forceResizeViewport);
        window.visualViewport.addEventListener('scroll', forceResizeViewport);
      }

      // Body/page scrolling must not move the input area. Only the talk timeline scrolls.
      document.addEventListener('touchmove', function(e) {
        if (!document.body.classList.contains('keyboard-focused')) return;
        if (timeline && timeline.contains(e.target)) return;
        e.preventDefault();
      }, { passive: false });

      inputSpeech.addEventListener('focus', () => {
        document.body.classList.add('keyboard-focused');
        trashZone.style.bottom = '80px';
        forceResizeViewport();
        setTimeout(forceResizeViewport, 50);
        setTimeout(forceResizeViewport, 180);
        setTimeout(scrollTimelineForKeyboard, 260);
      });

      inputSpeech.addEventListener('blur', () => {
        document.body.classList.remove('keyboard-focused');
        document.body.classList.remove('keyboard-open');
        trashZone.style.bottom = '140px';
        setTimeout(forceResizeViewport, 80);
      });

      inputSpeech.addEventListener('input', function() {
        resizeInputSpeech(this);
        renderInputStageDirectionHighlight();
        forceResizeViewport();
        scrollTimelineForKeyboard();
      });

      window.addEventListener('resize', forceResizeViewport);
      window.addEventListener('orientationchange', () => {
        originalViewportHeight = 0;
        document.body.classList.remove('keyboard-open');
        setTimeout(forceResizeViewport, 120);
        setTimeout(forceResizeViewport, 420);
      });
    }

    function forceResizeViewport() {
      const editorView = document.getElementById('editorView');
      if (!editorView || editorView.classList.contains('hidden')) return;

      const viewport = window.visualViewport;
      const vh = Math.max(1, Math.floor(viewport ? viewport.height : window.innerHeight));
      lastViewportLayoutHeight = vh;
      const viewportWidth = Math.floor(viewport ? viewport.width : window.innerWidth);
      const isTouchPhone = window.matchMedia && window.matchMedia('(pointer: coarse)').matches && Math.min(viewportWidth, window.innerWidth) <= 900;
      const referenceHeight = Math.max(originalViewportHeight || 0, window.innerHeight || 0, document.documentElement.clientHeight || 0);
      if (!document.body.classList.contains('keyboard-focused') && vh > originalViewportHeight) {
        originalViewportHeight = vh;
      }
      const keyboardGap = Math.max(referenceHeight - vh, 0);
      const keyboardOpen = document.body.classList.contains('keyboard-focused') && isTouchPhone && keyboardGap > Math.max(120, referenceHeight * 0.18);
      document.body.classList.toggle('keyboard-open', keyboardOpen);

      document.documentElement.style.setProperty('--app-height', vh + 'px');
      document.body.style.height = vh + 'px';
      editorView.style.height = vh + 'px';
      editorView.style.maxHeight = vh + 'px';
      editorView.style.transform = '';
      updateEditorDesktopChatWallpaperFrame();
      restoreActiveViewportAnchor();
      if (preserveViewportAfterEdit) scheduleViewportPreserveRelease();
    }

    function initWallpaperPan() {
      const preview = document.getElementById('wallpaperPreview');
      if (!preview) return;

      preview.addEventListener('pointerdown', function(e) {
        if (!selectedWallpaperBase64) return;
        e.preventDefault();
        preview.setPointerCapture?.(e.pointerId);
        wallpaperPanStart = { x: e.clientX, y: e.clientY };
        wallpaperPanOffset = { x: wallpaperOffsetX, y: wallpaperOffsetY };
      });

      preview.addEventListener('pointermove', function(e) {
        if (!selectedWallpaperBase64 || !wallpaperPanStart || !wallpaperPanOffset) return;
        e.preventDefault();

        const rect = preview.getBoundingClientRect();
        const dx = e.clientX - wallpaperPanStart.x;
        const dy = e.clientY - wallpaperPanStart.y;
        wallpaperOffsetX = Math.max(0, Math.min(100, wallpaperPanOffset.x - (dx / rect.width) * 100));
        wallpaperOffsetY = Math.max(0, Math.min(100, wallpaperPanOffset.y - (dy / rect.height) * 100));
        updateWallpaperPreviewStyle();
      });

      const resetWallpaperPan = function(e) {
        if (e && typeof e.pointerId !== 'undefined') {
          preview.releasePointerCapture?.(e.pointerId);
        }
        wallpaperPanStart = null;
        wallpaperPanOffset = null;
      };

      preview.addEventListener('pointerup', resetWallpaperPan);
      preview.addEventListener('pointercancel', resetWallpaperPan);
      preview.addEventListener('pointerleave', resetWallpaperPan);
    }

    /* ==========================================
       マルチポインター・ピンチズーム
       ========================================== */
    let activePointers = [];
    let initialPinchDistance = -1;
    let initialPanPoint = null;
    let initialPanOffset = null;

    function resetAvatarGesture() {
      activePointers = [];
      initialPinchDistance = -1;
      initialPanPoint = null;
      initialPanOffset = null;
    }

    function initPointerPinchZoom() {
      const touchArea = document.getElementById('avatarPreview');
      const slider = document.getElementById('charZoomSlider');

      if (!touchArea || !slider) return;

      touchArea.addEventListener('pointerdown', function(e) {
        if (!selectedAvatarBase64) return;
        e.preventDefault();
        touchArea.setPointerCapture?.(e.pointerId);
        activePointers.push(e);
        if (activePointers.length === 2) {
          initialPinchDistance = calcPointerDistance(activePointers[0], activePointers[1]);
          initialPanPoint = null;
          initialPanOffset = null;
        } else if (activePointers.length === 1) {
          initialPanPoint = { x: e.clientX, y: e.clientY };
          initialPanOffset = { x: avatarOffsetX, y: avatarOffsetY };
        }
      });

      touchArea.addEventListener('pointermove', function(e) {
        if (!selectedAvatarBase64) return;
        const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
        if (idx > -1) {
          activePointers[idx] = e;
        }

        if (activePointers.length === 2 && initialPinchDistance > 0) {
          e.preventDefault();
          
          const currentDistance = calcPointerDistance(activePointers[0], activePointers[1]);
          const diff = currentDistance - initialPinchDistance;
          
          let currentZoom = parseInt(slider.value);
          let newZoom = Math.round(currentZoom + diff * 0.4);
          
          if (newZoom < parseInt(slider.min)) newZoom = parseInt(slider.min);
          if (newZoom > parseInt(slider.max)) newZoom = parseInt(slider.max);
          
          slider.value = newZoom;
          updatePreviewStyle(); 
          
          initialPinchDistance = currentDistance; 
        } else if (activePointers.length === 1 && initialPanPoint && initialPanOffset) {
          e.preventDefault();

          const preview = document.getElementById('avatarPreview');
          const rect = preview.getBoundingClientRect();
          const dx = e.clientX - initialPanPoint.x;
          const dy = e.clientY - initialPanPoint.y;

          avatarOffsetX = Math.max(0, Math.min(100, initialPanOffset.x - (dx / rect.width) * 100));
          avatarOffsetY = Math.max(0, Math.min(100, initialPanOffset.y - (dy / rect.height) * 100));
          updatePreviewStyle();
        }
      });

      const resetPinch = function(e) {
        if (e && typeof e.pointerId !== 'undefined') {
          touchArea.releasePointerCapture?.(e.pointerId);
        }
        const idx = activePointers.findIndex(p => p.pointerId === e.pointerId);
        if (idx > -1) {
          activePointers.splice(idx, 1);
        }
        if (activePointers.length < 2) {
          initialPinchDistance = -1;
        }
        if (activePointers.length === 0) {
          initialPanPoint = null;
          initialPanOffset = null;
        }
      };

      touchArea.addEventListener('pointerup', resetPinch);
      touchArea.addEventListener('pointercancel', resetPinch);
      touchArea.addEventListener('pointerout', resetPinch);
      touchArea.addEventListener('pointerleave', resetPinch);
    }

    function calcPointerDistance(p1, p2) {
      const dx = p1.clientX - p2.clientX;
      const dy = p1.clientY - p2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // 上部の「⋯」メニュー（スマホでボタンが折り返さないよう、使用頻度の低い操作をまとめる）
    function setNavMenuOpen(open) {
      const menu = document.getElementById('navMenu');
      const button = document.getElementById('navMenuButton');
      if (!menu || !button) return;
      menu.classList.toggle('hidden', !open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function toggleNavMenu(event) {
      event?.stopPropagation();
      setNavMenuOpen(document.getElementById('navMenu')?.classList.contains('hidden'));
    }

    // スマホの編集モードでは、各セリフの操作ボタンを「⋯ 操作」で開いたときだけ表示する
    function toggleTalkTools(event, button) {
      event?.stopPropagation();
      const bubble = button?.closest('.chat-bubble');
      if (!bubble) return;
      const open = !bubble.classList.contains('tools-open');
      document.querySelectorAll('.chat-bubble.tools-open').forEach(item => item.classList.remove('tools-open'));
      bubble.classList.toggle('tools-open', open);
    }

    function runNavMenuAction(action) {
      setNavMenuOpen(false);
      if (typeof action === 'function') action();
    }

    document.addEventListener('click', event => {
      if (!event.target.closest?.('.nav-menu-wrap')) setNavMenuOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') setNavMenuOpen(false);
    });

    // 文字サイズ（この端末だけの表示設定）
    const SCRIPTMAKER_EDITOR_FONT_SCALE_KEY = 'scriptmaker_editor_font_scale_v1';
    const EDITOR_FONT_SCALES = [
      { value: 0.9, label: '小' },
      { value: 1, label: '標準' },
      { value: 1.15, label: '大' },
      { value: 1.3, label: '特大' }
    ];

    function currentEditorFontScale() {
      const value = Number(localStorage.getItem(SCRIPTMAKER_EDITOR_FONT_SCALE_KEY));
      return EDITOR_FONT_SCALES.some(scale => scale.value === value) ? value : 1;
    }

    function applyEditorFontScale() {
      document.documentElement.style.setProperty('--talk-font-scale', String(currentEditorFontScale()));
    }

    function renderDisplaySettingsOptions() {
      const list = document.getElementById('fontScaleOptions');
      if (!list) return;
      const current = currentEditorFontScale();
      list.innerHTML = EDITOR_FONT_SCALES.map(scale =>
        '<button type="button" class="font-scale-option' + (scale.value === current ? ' active' : '') + '" aria-pressed="' + (scale.value === current) + '" onclick="setEditorFontScale(' + scale.value + ')">' + scale.label + '</button>'
      ).join('');
    }

    function openDisplaySettingsModal() {
      renderDisplaySettingsOptions();
      openModal('displaySettingsModal');
    }

    function setEditorFontScale(value) {
      localStorage.setItem(SCRIPTMAKER_EDITOR_FONT_SCALE_KEY, String(value));
      applyEditorFontScale();
      renderDisplaySettingsOptions();
    }

    applyEditorFontScale();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js').then(function(registration) {
      registration.update();
    }).catch(function(error) {
      console.warn('Service worker registration failed:', error);
    });
  });
}


    // ===== 起動処理（すべてのファイルを読み込んだ後に実行する） =====
    window.onload = function() {
      const saved = localStorage.getItem('script_assistant_data_v21');
      if (saved) {
        state = JSON.parse(saved);
      } else {
        state.projects["p_default"] = {
          title: "チャットプロジェクト",
          characters: [],
          talks: []
        };
        saveState();
      }

      normalizeProjectData();
      migrateBase64WallpapersToIndexedDB().then(changed => {
        if (!changed) return;
        saveState();
        applyProjectWallpaper(true);
        renderTimeline();
      }).catch(error => console.warn('Wallpaper migration failed:', error));
      syncCharacterLibraryFromProjects();

      renderProjectList();
      initSortableDragAndTrash();
      initKeyboardAvoidance();   
      initPointerPinchZoom();
      initCountControls();
      initCharacterModalActions();
      initWallpaperModalActions();
      initWallpaperPan();
      initSceneWallpaperScroll();
      initNumberSettingsControls();
      initEditorDisplayModeControls();
      syncEditorOrientationForDisplayMode(false);
      initCloudSyncFromUrl();
      editorAppReady = true;
      if (editorBackupMeta().syncSpaceId) loadEditorBackupCloudState();
    };

    setTimeout(initEditorAuthGate, 0);
