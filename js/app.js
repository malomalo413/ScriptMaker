let state = {
      currentProjectId: null,
      projects: {},
      apiKey: "",
      aiToggle: true
    };

    let currentCharacter = 'らん';
    let isEditMode = false;
    let editingCharName = null;
    let selectedAvatarBase64 = "";
    let avatarOffsetX = 50;
    let avatarOffsetY = 50;
    let editingTalkIndex = null;
    let selectedTalkIndexes = new Set();
    let predictedTalks = []; 
    let selectedWallpaperBase64 = "";
    let wallpaperSize = 100;
    let wallpaperOffsetX = 50;
    let wallpaperOffsetY = 50;
    let wallpaperPanStart = null;
    let wallpaperPanOffset = null;

    let originalViewportHeight = window.innerHeight;
    const GEMINI_MODEL_CANDIDATES = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash'
    ];

    window.onload = function() {
      const saved = localStorage.getItem('script_assistant_data_v21');
      if (saved) {
        state = JSON.parse(saved);
        if (state.apiKey === undefined) state.apiKey = "";
        if (state.aiToggle === undefined) state.aiToggle = true;
      } else {
        state.projects["p_default"] = {
          title: "チャットプロジェクト",
          characters: [
            { name: "らん", avatar: "", isRound: true, zoom: 100, isProtagonist: true },
            { name: "キャラ2", avatar: "", isRound: true, zoom: 100, isProtagonist: false }
          ],
          talks: [
            { charName: "らん", text: "セリフを長押し（0.4秒）すると、画面下の中央にゴミ箱が現れます！" },
            { charName: "キャラ2", text: "そのままゴミ箱までスワイプして指を離すと消去できるよ！" }
          ]
        };
        state.apiKey = "";
        state.aiToggle = true;
        saveState();
      }

      normalizeProjectData();

      document.getElementById('apiKey').value = state.apiKey;
      document.getElementById('aiToggle').checked = state.aiToggle;

      renderProjectList();
      initSortableDragAndTrash();
      initKeyboardAvoidance();   
      initPointerPinchZoom();
      initCountControls();
      initCharacterModalActions();
      initWallpaperModalActions();
      initWallpaperPan();
    };

    function normalizeProjectData() {
      Object.values(state.projects || {}).forEach(project => {
        if (!Array.isArray(project.characters)) project.characters = [];
        project.characters.forEach((char, index) => {
          if (char.isProtagonist === undefined) {
            char.isProtagonist = index === 0;
          }
        });
        if (!project.characters.some(char => char.isProtagonist) && project.characters[0]) {
          project.characters[0].isProtagonist = true;
        }
      });
    }

    function saveState() {
      try {
        localStorage.setItem('script_assistant_data_v21', JSON.stringify(state));
        return true;
      } catch (e) {
        console.error("保存エラー:", e);
        alert("画像データが大きすぎるため保存できませんでした。別の画像を選ぶか、画像サイズを小さくしてください。");
        return false;
      }
    }

    function saveAiConfig() {
      state.apiKey = document.getElementById('apiKey').value.trim();
      state.aiToggle = document.getElementById('aiToggle').checked;
      predictedTalks = [];
      saveState();
      updateAiStatus();
      closeModal('aiConfigModal');
      alert("AI設定とAPIキーを保存しました。");

      const project = state.projects[state.currentProjectId];
      if (state.aiToggle && state.apiKey && project && project.talks.length > 0) {
        callGeminiApiForPrediction();
      } else {
        renderTimeline();
      }
    }

    function renderProjectList() {
      const list = document.getElementById('projectList');
      list.innerHTML = '';
      Object.keys(state.projects).forEach(id => {
        const project = state.projects[id];
        const card = document.createElement('div');
        card.className = 'project-card';
        card.innerHTML = `
          <div class="project-info" onclick="openProject('${id}')">
            <h3>${project.title}</h3>
            <p>キャラクター: ${project.characters.length}人 / 台本: ${project.talks.length}行</p>
          </div>
          <button class="delete-project-btn" onclick="deleteProject(event, '${id}')">削除</button>
        `;
        list.appendChild(card);
      });
    }

    function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
    function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

    function initCharacterModalActions() {
      const confirmBtn = document.getElementById('charConfirmBtn');
      if (!confirmBtn) return;

      const runConfirm = function(e) {
        e.preventDefault();
        e.stopPropagation();
        confirmSaveCharacter();
      };

      confirmBtn.addEventListener('pointerup', runConfirm);
      confirmBtn.addEventListener('touchend', runConfirm);
      confirmBtn.addEventListener('click', runConfirm);
    }

    function initWallpaperModalActions() {
      const confirmBtn = document.getElementById('wallpaperConfirmBtn');
      if (!confirmBtn) return;

      const runConfirm = function(e) {
        e.preventDefault();
        e.stopPropagation();
        confirmWallpaper();
      };

      confirmBtn.addEventListener('pointerup', runConfirm);
      confirmBtn.addEventListener('touchend', runConfirm);
      confirmBtn.addEventListener('click', runConfirm);
    }

    function openCreateProjectModal() {
      document.getElementById('newProjectName').value = '';
      openModal('projectModal');
    }

    function confirmCreateProject() {
      const name = document.getElementById('newProjectName').value.trim();
      if (!name) return;
      const id = "p_" + Date.now();
      state.projects[id] = {
        title: name,
        characters: [
          { name: "らん", avatar: "", isRound: true, zoom: 100, isProtagonist: true },
          { name: "キャラ2", avatar: "", isRound: true, zoom: 100, isProtagonist: false }
        ],
        talks: []
      };
      saveState();
      renderProjectList();
      closeModal('projectModal');
      openProject(id);
    }

    function deleteProject(event, id) {
      event.stopPropagation();
      if (confirm("このプロジェクトを削除しますか？")) {
        delete state.projects[id];
        saveState();
        renderProjectList();
      }
    }

    function openWallpaperModal() {
      const project = state.projects[state.currentProjectId];
      const wallpaper = project?.wallpaper || {};

      selectedWallpaperBase64 = wallpaper.image || "";
      wallpaperSize = Math.max(100, wallpaper.size || 100);
      wallpaperOffsetX = wallpaper.offsetX ?? 50;
      wallpaperOffsetY = wallpaper.offsetY ?? 50;
      wallpaperPanStart = null;
      wallpaperPanOffset = null;

      document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundImage = selectedWallpaperBase64 ? `url(${selectedWallpaperBase64})` : "";
      updateWallpaperPreviewStyle();
      openModal('wallpaperModal');
    }

    function previewWallpaper(input) {
      const file = input.files[0];
      if (!file) return;

      compressImageFile(file, 1400, 0.82, function(dataUrl) {
        selectedWallpaperBase64 = dataUrl;
        wallpaperSize = 100;
        wallpaperOffsetX = 50;
        wallpaperOffsetY = 50;
        document.getElementById('wallpaperSizeSlider').value = wallpaperSize;
        document.getElementById('wallpaperPreview').style.backgroundImage = `url(${selectedWallpaperBase64})`;
        updateWallpaperPreviewStyle();
      });
    }

    function updateWallpaperPreviewStyle() {
      wallpaperSize = parseInt(document.getElementById('wallpaperSizeSlider').value);
      document.getElementById('wallpaperSizeVal').innerText = wallpaperSize + "%";

      const preview = document.getElementById('wallpaperPreview');
      preview.style.backgroundSize = wallpaperSize + "%";
      preview.style.backgroundPosition = `${wallpaperOffsetX}% ${wallpaperOffsetY}%`;
    }

    function confirmWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      project.wallpaper = selectedWallpaperBase64 ? {
        image: selectedWallpaperBase64,
        size: wallpaperSize,
        offsetX: wallpaperOffsetX,
        offsetY: wallpaperOffsetY
      } : null;

      applyProjectWallpaper();
      closeModal('wallpaperModal');
      saveState();
    }

    function clearWallpaper() {
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      project.wallpaper = null;
      selectedWallpaperBase64 = "";
      saveState();
      applyProjectWallpaper();
      closeModal('wallpaperModal');
    }

    function applyProjectWallpaper() {
      const wallpaperLayer = document.getElementById('editorWallpaperLayer');
      const project = state.projects[state.currentProjectId];
      const wallpaper = project?.wallpaper;

      if (!wallpaperLayer || !wallpaper?.image) {
        if (wallpaperLayer) {
          wallpaperLayer.style.backgroundImage = "";
          wallpaperLayer.style.transform = "";
          wallpaperLayer.style.backgroundPosition = "";
        }
        return;
      }

      const scale = Math.max(1, (wallpaper.size || 100) / 100);
      wallpaperLayer.style.backgroundImage = `url(${wallpaper.image})`;
      wallpaperLayer.style.backgroundPosition = `${wallpaper.offsetX ?? 50}% ${wallpaper.offsetY ?? 50}%`;
      wallpaperLayer.style.transform = `scale(${scale})`;
    }

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

      predictedTalks = []; 
      applyProjectWallpaper();
      renderCharSelector();
      renderTimeline();
      updateMetaStats();
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
      predictedTalks = [];
      renderProjectList();
    }

    function renderCharSelector() {
      const container = document.getElementById('charSelectorContainer');
      container.innerHTML = '';
      const project = state.projects[state.currentProjectId];

      project.characters.forEach(char => {
        const btn = document.createElement('button');
        btn.className = `char-icon-btn ${currentCharacter === char.name ? 'active' : ''}`;
        btn.onpointerdown = function(e) { e.preventDefault(); selectChar(this, char.name); };
        btn.onclick = function() { selectChar(this, char.name); };
        btn.oncontextmenu = function(e) { e.preventDefault(); openCharEditModal(char.name); };

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
      addBtn.onclick = openCharAddModal;
      addBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`;
      container.appendChild(addBtn);

      const aiBtn = document.createElement('button');
      aiBtn.className = 'char-ai-btn';
      aiBtn.onclick = function() { openModal('aiConfigModal'); };
      aiBtn.innerHTML = '🤖';
      container.appendChild(aiBtn);
    }

    function selectChar(element, name) {
      const input = document.getElementById('inputSpeech');
      const shouldKeepKeyboard = document.body.classList.contains('keyboard-focused') || document.activeElement === input;

      document.querySelectorAll('.char-icon-btn').forEach(b => b.classList.remove('active'));
      element.classList.add('active');
      currentCharacter = name;

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
      editingCharName = null;
      selectedAvatarBase64 = "";
      avatarOffsetX = 50;
      avatarOffsetY = 50;
      document.getElementById('charModalTitle').innerText = "キャラクター追加";
      document.getElementById('newCharName').value = "";
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
      editingCharName = name;
      const project = state.projects[state.currentProjectId];
      const char = project.characters.find(c => c.name === name);

      document.getElementById('charModalTitle').innerText = `${name} のアバター編集`;
      document.getElementById('newCharName').value = char.name;
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
      resetAvatarGesture();
      const name = document.getElementById('newCharName').value.trim();
      if (!name) return;

      const project = state.projects[state.currentProjectId];
      const isRound = document.getElementById('charRoundCheck').checked;
      const isProtagonist = document.getElementById('charProtagonistCheck').checked;
      const zoom = parseInt(document.getElementById('charZoomSlider').value);

      if (editingCharName === null) {
        if (project.characters.some(c => c.name === name) || name === '情景描写') {
          alert("同名のキャラクターが既に存在します。");
          return;
        }
        if (isProtagonist) project.characters.forEach(c => c.isProtagonist = false);
        project.characters.push({ name: name, avatar: selectedAvatarBase64, isRound: isRound, zoom: zoom, offsetX: avatarOffsetX, offsetY: avatarOffsetY, isProtagonist: isProtagonist });
        currentCharacter = name;
      } else {
        const char = project.characters.find(c => c.name === editingCharName);
        if (char) {
          if (name !== editingCharName && (project.characters.some(c => c.name === name) || name === '情景描写')) {
            alert("同名のキャラクターが既に存在します。");
            return;
          }

          project.talks.forEach(t => {
            if (t.charName === editingCharName) {
              t.charName = name;
            }
          });

          char.name = name;
          char.avatar = selectedAvatarBase64;
          char.isRound = isRound;
          char.isProtagonist = isProtagonist;
          char.zoom = zoom;
          char.offsetX = avatarOffsetX;
          char.offsetY = avatarOffsetY;
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

      renderCharSelector();
      renderTimeline();
      closeModal('charModal');
      saveState();
    }

    function isProtagonistTalk(project, charName) {
      const char = project.characters.find(c => c.name === charName);
      return !!char?.isProtagonist;
    }

    function renderTimeline() {
      const timeline = document.getElementById('talkTimeline');
      timeline.innerHTML = '';
      const project = state.projects[state.currentProjectId];
      if (!project) return;

      // 1. 確定済みのトークを描画
      project.talks.forEach((talk, index) => {
        const isScene = talk.charName === '情景描写';
        const isRight = isProtagonistTalk(project, talk.charName) && !isScene;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isScene ? 'scene' : (isRight ? 'right' : 'left')}`;
        bubble.dataset.index = index;

        bubble.onpointerup = function(e) {
          if (e.pointerType === 'touch') {
            e.preventDefault();
            openEditTalkModal(index);
          }
        };
        bubble.onclick = function() { openEditTalkModal(index); };

        let avatarHtml = '';
        if (!isScene) {
          const charInfo = project.characters.find(c => c.name === talk.charName);
          if (charInfo && charInfo.avatar) {
            const radius = charInfo.isRound !== false ? '50%' : '8px';
            const zoom = charInfo.zoom || 100;
            const posX = charInfo.offsetX ?? 50;
            const posY = charInfo.offsetY ?? 50;
            avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${charInfo.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
          } else {
            const short = talk.charName ? talk.charName.substring(0,2) : "??";
            avatarHtml = `<div class="avatar-dummy">${short}</div>`;
          }
        }

        bubble.innerHTML = `
          <input type="checkbox" class="talk-select" ${selectedTalkIndexes.has(index) ? 'checked' : ''} onclick="toggleTalkSelection(event, ${index})">
          ${avatarHtml}
          <div class="bubble-content">
            <span class="char-name">${talk.charName}</span>
            <div class="message-text">${talk.text}</div>
            <div class="talk-edit-tools" onclick="event.stopPropagation()">
              <button onclick="moveTalk(event, ${index}, -1)">↑</button>
              <button onclick="moveTalk(event, ${index}, 1)">↓</button>
              <button onclick="duplicateTalk(event, ${index})">複製</button>
              <button class="btn-talk-delete" onclick="deleteTalk(event, ${index})">削除</button>
            </div>
          </div>
        `;
        timeline.appendChild(bubble);
      });

      // 2. AI予測結果（半透明・3回分）のレンダリング処理
      if (state.aiToggle && predictedTalks.length > 0) {
        predictedTalks.forEach((talk, idx) => {
          const isScene = talk.charName === '情景描写';
          const isRight = isProtagonistTalk(project, talk.charName) && !isScene;
          const bubble = document.createElement('div');
          bubble.className = `chat-bubble ${isScene ? 'scene' : (isRight ? 'right' : 'left')} ai-predicted`;

          bubble.onclick = function() {
            acceptAiPrediction(idx);
          };

          let avatarHtml = '';
          if (!isScene) {
            const charInfo = project.characters.find(c => c.name === talk.charName);
            if (charInfo && charInfo.avatar) {
              const radius = charInfo.isRound !== false ? '50%' : '8px';
              const zoom = charInfo.zoom || 100;
              const posX = charInfo.offsetX ?? 50;
              const posY = charInfo.offsetY ?? 50;
              avatarHtml = `<div class="avatar" style="border-radius:${radius}; background-image:url(${charInfo.avatar}); background-size:${zoom}%; background-position:${posX}% ${posY}%;"></div>`;
            } else {
              const short = talk.charName ? talk.charName.substring(0,2) : "??";
              avatarHtml = `<div class="avatar-dummy">${short}</div>`;
            }
          }

          bubble.innerHTML = `
            ${avatarHtml}
            <div class="bubble-content">
              <span class="char-name">${talk.charName} (予測候補)</span>
              <div class="message-text">${talk.text}</div>
            </div>
          `;
          timeline.appendChild(bubble);
        });
      }

      // 3. ローディング表記の制御
      const predicting = document.createElement('div');
      predicting.className = 'predicting-msg hidden';
      predicting.id = 'aiPredicting';
      predicting.innerText = '🔮 Geminiが次回の展開を予測中...';
      timeline.appendChild(predicting);
      
      updateSelectedTalkCount();
      scrollToBottom();
    }

    function sendMessage() {
      const input = document.getElementById('inputSpeech');
      const text = input.value.trim();
      if (!text) return;

      const project = state.projects[state.currentProjectId];
      project.talks.push({ charName: currentCharacter, text: text });

      predictedTalks = [];

      saveState();
      renderTimeline();
      updateMetaStats();
      
      input.value = '';
      input.style.height = '42px';
      scrollToBottom();
      
      callGeminiApiForPrediction();
    }

    function sendMessageOnEnter(e) {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      sendMessage();
    }

    /* 🎯 【構造修正】Gemini 1.5 FlashのJSON構造に対応*/
    async function callGeminiApiForPrediction() {
      if (!state.aiToggle) return;
      if (!state.apiKey) {
        console.log("APIキーが未入力です。");
        return;
      }

      const project = state.projects[state.currentProjectId];
      if (!project || project.talks.length === 0) return;

      const loader = document.getElementById('aiPredicting');
      if (loader) loader.classList.remove('hidden');
      scrollToBottom();

      const charNames = project.characters.map(c => c.name);
      if (!charNames.includes("情景描写")) charNames.push("情景描写");

      const recentTalks = project.talks.slice(-15);
      const contextText = recentTalks.map(t => `[${t.charName}]: ${t.text}`).join("\n");

      const prompt = `あなたはチャット形式の台本作成アシスタントです。
これまでの台本の流れを読み取り、自然に続く返信をちょうど3件だけ予測してください。

条件:
- 返信は必ず以下の利用可能キャラクター名のいずれかを charName に入れてください。
- 余計な説明、挨拶、Markdown、コードフェンスは出力しないでください。
- 出力は必ずJSON配列だけにしてください。
- text はそのまま台本に使える短めのセリフにしてください。

利用可能キャラクター:
${charNames.join(', ')}

出力形式:
[
  {"charName":"キャラクター名","text":"セリフ1"},
  {"charName":"キャラクター名","text":"セリフ2"},
  {"charName":"キャラクター名","text":"セリフ3"}
]

これまでの台本:
${contextText}`;

      try {
        const data = await requestGeminiPrediction(prompt);
        const rawText = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
        if (!rawText) throw new Error("AIから空の応答が返りました。");

        const parsed = parsePredictionItems(rawText);
        if (!Array.isArray(parsed)) throw new Error("AI応答がJSON配列ではありません。");

        const validNames = new Set(charNames);
        predictedTalks = parsed
          .filter(item => item && typeof item.charName === 'string' && typeof item.text === 'string')
          .map(item => ({
            charName: validNames.has(item.charName) ? item.charName : (project.characters[0]?.name || currentCharacter),
            text: item.text.trim()
          }))
          .filter(item => item.text)
          .slice(0, 3);

        if (predictedTalks.length === 0) {
          throw new Error("表示できる予測セリフがありませんでした。");
        }
      } catch (e) {
        console.error("Gemini prediction error:", e);
        predictedTalks = [
          {
            charName: "システム警告",
            text: `予測に失敗しました: ${e.message}`,
            isSystem: true
          }
        ];
      } finally {
        if (loader) loader.classList.add('hidden');
        renderTimeline();
      }
    }

    async function requestGeminiPrediction(prompt) {
      let lastError = null;

      for (const model of GEMINI_MODEL_CANDIDATES) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }]
                }
              ],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 512,
                responseMimeType: "application/json",
                responseSchema: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      charName: { type: "STRING" },
                      text: { type: "STRING" }
                    },
                    required: ["charName", "text"]
                  }
                }
              }
            })
          });

          if (response.ok) return response.json();

          const errorData = await response.json().catch(() => ({}));
          const message = errorData.error?.message || `HTTP error: ${response.status}`;
          lastError = new Error(message);

          const canTryNextModel = response.status === 404 || /not found|not supported|model/i.test(message);
          if (!canTryNextModel) break;
        } catch (error) {
          lastError = error;
          break;
        }
      }

      throw lastError || new Error("Gemini API request failed.");
    }

    function parsePredictionItems(text) {
      const jsonText = extractJsonArrayText(text);
      try {
        return JSON.parse(jsonText);
      } catch (error) {
        const repaired = parseLoosePredictionItems(jsonText);
        if (repaired.length > 0) return repaired;
        throw error;
      }
    }

    function parseLoosePredictionItems(text) {
      const items = [];
      const blocks = extractObjectBlocks(text);
      blocks.forEach(block => {
        const charName = readJsonishStringValue(block, 'charName');
        const itemText = readJsonishStringValue(block, 'text');
        if (charName && itemText) {
          items.push({
            charName: cleanupPredictionValue(charName),
            text: cleanupPredictionValue(itemText)
          });
        }
      });
      return items;
    }

    function extractObjectBlocks(text) {
      const blocks = [];
      let depth = 0;
      let start = -1;
      let inString = false;
      let escaped = false;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }
        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            blocks.push(text.slice(start, i + 1));
            start = -1;
          }
        }
      }

      if (blocks.length === 0) {
        const roughBlocks = text.match(/\{[\s\S]*?(?=\}\s*,|\}\s*\]|$)/g) || [];
        return roughBlocks.map(block => block.endsWith('}') ? block : block + '}');
      }
      return blocks;
    }

    function readJsonishStringValue(block, key) {
      const keyIndex = block.indexOf(`"${key}"`);
      if (keyIndex === -1) return "";
      const colonIndex = block.indexOf(':', keyIndex);
      if (colonIndex === -1) return "";
      const quoteIndex = block.indexOf('"', colonIndex);
      if (quoteIndex === -1) return "";

      let result = "";
      let escaped = false;
      for (let i = quoteIndex + 1; i < block.length; i++) {
        const ch = block[i];
        if (escaped) {
          result += ch;
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          const rest = block.slice(i + 1).trimStart();
          if (rest.startsWith(',') || rest.startsWith('}')) return result;
        }
        result += ch;
      }
      return result;
    }

    function cleanupPredictionValue(value) {
      return value.replace(/\s+/g, ' ').trim();
    }

    function extractJsonArrayText(text) {
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      }

      const start = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (start === -1 || end === -1 || end <= start) return cleaned;
      return cleaned.slice(start, end + 1);
    }

    function acceptAiPrediction(untilIndex) {
      const project = state.projects[state.currentProjectId];
      for (let i = 0; i <= untilIndex; i++) {
        const prediction = predictedTalks[i];
        if (prediction && !prediction.isSystem && prediction.charName !== "システム警告") {
          project.talks.push({
            charName: prediction.charName,
            text: prediction.text
          });
        }
      }
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();

      callGeminiApiForPrediction();
    }

    function openEditTalkModal(index) {
      editingTalkIndex = index;
      const project = state.projects[state.currentProjectId];
      const input = document.getElementById('editTalkInput');
      input.value = project.talks[index].text;
      openModal('editTalkModal');
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }

    function confirmEditTalk() {
      const newText = document.getElementById('editTalkInput').value.trim();
      if (!newText) return;
      const project = state.projects[state.currentProjectId];
      project.talks[editingTalkIndex].text = newText;
      saveState();
      renderTimeline();
      updateMetaStats();
      closeModal('editTalkModal');
    }

    function toggleEditMode() {
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
    }

    function clearTalkSelection() {
      selectedTalkIndexes.clear();
      renderTimeline();
    }

    function deleteSelectedTalks() {
      if (selectedTalkIndexes.size === 0) return;
      const project = state.projects[state.currentProjectId];
      project.talks = project.talks.filter((_, index) => !selectedTalkIndexes.has(index));
      selectedTalkIndexes.clear();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function deleteTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      project.talks.splice(index, 1);
      normalizeSelectedTalksAfterMutation();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function duplicateTalk(event, index) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const original = project.talks[index];
      if (!original) return;
      project.talks.splice(index + 1, 0, { charName: original.charName, text: original.text });
      selectedTalkIndexes.clear();
      predictedTalks = [];
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function moveTalk(event, index, direction) {
      event.stopPropagation();
      const project = state.projects[state.currentProjectId];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= project.talks.length) return;

      const [talk] = project.talks.splice(index, 1);
      project.talks.splice(targetIndex, 0, talk);
      selectedTalkIndexes.clear();
      selectedTalkIndexes.add(targetIndex);
      saveState();
      renderTimeline();
      updateMetaStats();
    }

    function normalizeSelectedTalksAfterMutation() {
      const project = state.projects[state.currentProjectId];
      selectedTalkIndexes = new Set([...selectedTalkIndexes].filter(index => index < project.talks.length));
    }

    function initCountControls() {
      const punctuationCheck = document.getElementById('excludePunctuationCheck');
      const customCheck = document.getElementById('excludeCustomCheck');
      const customInput = document.getElementById('customExcludeChars');

      [punctuationCheck, customCheck].forEach(el => {
        el.addEventListener('change', updateMetaStats);
      });
      customInput.addEventListener('input', updateMetaStats);
    }

    function getCountedText(text) {
      let result = text || "";
      const excludePunctuation = document.getElementById('excludePunctuationCheck')?.checked;
      const excludeCustom = document.getElementById('excludeCustomCheck')?.checked;
      const customChars = document.getElementById('customExcludeChars')?.value || "";

      if (excludePunctuation) {
        result = result.replace(/[、。,.，．！？!?「」『』（）()［］\[\]｛｝{}【】・…:：;；"'“”‘’\-〜～]/g, "");
      }

      if (excludeCustom && customChars) {
        const customSet = new Set([...customChars]);
        result = [...result].filter(ch => !customSet.has(ch)).join("");
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
      project.talks.forEach(t => {
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

    function updateAiStatus() {
      const isAiOn = document.getElementById('aiToggle').checked;
      if (!isAiOn) {
        predictedTalks = [];
        renderTimeline();
      }
    }

    function scrollToBottom() {
      const timeline = document.getElementById('talkTimeline');
      timeline.scrollTop = timeline.scrollHeight;
    }

    function saveDataAlert() { alert("データを完全に内部保存しました。"); }
    function exportDataAlert() { alert("台本データの出力を開始します。"); }

    /* ==========================================
       👑 ドラッグ＆ドロップ削除設定
       ========================================== */
    function initSortableDragAndTrash() {
      if (typeof Sortable === 'undefined') {
        console.warn('SortableJS is not loaded. Drag delete is disabled.');
        return;
      }

      const trashZone = document.getElementById('trashZone');
      let draggingItem = null;

      Sortable.create(document.getElementById('talkTimeline'), {
        group: 'talks',
        animation: 150,
        handle: '.chat-bubble:not(.ai-predicted)', 
        filter: '#aiPredicting, .ai-predicted',
        delay: 400,            
        delayOnTouchOnly: true, 
        
        onStart: function(evt) {
          draggingItem = evt.item;
          if (draggingItem) lockDragShape(draggingItem);
          trashZone.classList.add('visible');
        },
        onMove: function(evt, originalEvent) {
          updateDragShrink(originalEvent, trashZone, draggingItem);
        },
        onEnd: function (evt) {
          const droppedOnTrash = evt.to === trashZone;
          const deleted = deleteDraggedTalkIfOverTrash(evt, trashZone, draggingItem) ||
            (droppedOnTrash && deleteDraggedTalkByItem(draggingItem));
          resetDragShrink(draggingItem);
          draggingItem = null;
          trashZone.classList.remove('visible');
          trashZone.classList.remove('hover');
          
          if (deleted || droppedOnTrash) return;

          const project = state.projects[state.currentProjectId];
          const newTalks = [];
          document.querySelectorAll('#talkTimeline .chat-bubble:not(.ai-predicted)').forEach(el => {
            const idx = parseInt(el.dataset.index);
            if (!isNaN(idx)) newTalks.push(project.talks[idx]);
          });
          project.talks = newTalks;
          saveState();
          renderTimeline();
        }
      });

      Sortable.create(trashZone, {
        group: {
          name: 'talks',
          put: true,
          pull: false
        },
        onAdd: function (evt) {
          const itemEl = evt.item;
          if (itemEl.parentNode) {
            itemEl.parentNode.removeChild(itemEl);
          }
        }
      });
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
      project.talks.splice(idx, 1);
      saveState();
      renderTimeline();
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

      inputSpeech.addEventListener('keydown', sendMessageOnEnter);

      originalViewportHeight = window.innerHeight;

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', forceResizeViewport);
        window.visualViewport.addEventListener('scroll', forceResizeViewport);
      } else {
        window.addEventListener('resize', forceResizeViewport);
      }

      inputSpeech.addEventListener('focus', () => {
        document.body.classList.add('keyboard-focused');
        trashZone.style.bottom = '80px';
        
        setTimeout(() => {
          const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
          if (originalViewportHeight - currentHeight < 80) {
            document.body.classList.add('keyboard-no-resize'); 
          }
          scrollToBottom();
        }, 250);

        setTimeout(scrollToBottom, 50);
        setTimeout(scrollToBottom, 150);
        setTimeout(scrollToBottom, 450);
      });

      inputSpeech.addEventListener('blur', () => {
        document.body.classList.remove('keyboard-focused');
        document.body.classList.remove('keyboard-no-resize'); 
        trashZone.style.bottom = '140px';
        setTimeout(forceResizeViewport, 100);
      });

      inputSpeech.addEventListener('input', function() {
        this.style.height = '42px'; 
        let newHeight = this.scrollHeight;
        if (newHeight < 42) newHeight = 42;
        if (newHeight > 120) newHeight = 120; 
        this.style.height = newHeight + 'px';
        
        scrollToBottom(); 
      });
    }

    function forceResizeViewport() {
      const editorView = document.getElementById('editorView');
      if (editorView.classList.contains('hidden')) return;
      
      if (!document.body.classList.contains('keyboard-no-resize')) {
        const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.body.style.height = vh + 'px';
        editorView.style.height = vh + 'px';
      }
      scrollToBottom();
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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./service-worker.js').then(function(registration) {
      registration.update();
    }).catch(function(error) {
      console.warn('Service worker registration failed:', error);
    });
  });
}
