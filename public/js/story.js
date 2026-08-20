(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const elements = {
    app: $('#app'),
    library: $('#library'),
    openLibrary: $('#open-library'),
    storyList: $('#story-list'),
    search: $('#story-search'),
    welcome: $('#welcome'),
    stage: $('#stage'),
    background: $('#scene-background'),
    still: $('#still-image'),
    character: $('#character-image'),
    storyKind: $('#story-kind'),
    storyTitle: $('#story-title'),
    dialoguePanel: $('#dialogue-panel'),
    speaker: $('#speaker-name'),
    ko: $('#dialogue-ko'),
    ja: $('#dialogue-ja'),
    progress: $('#scene-progress'),
    voiceIndicator: $('#voice-indicator'),
    replayVoice: $('#replay-voice'),
    toggleDialogue: $('#toggle-dialogue'),
    choicePanel: $('#choice-panel'),
    choiceList: $('#choice-list'),
    complete: $('#story-complete'),
    completeTitle: $('#complete-title'),
    completeNext: $('#complete-next'),
    nextStory: $('#next-story'),
    log: $('#dialogue-log'),
    settingsDialog: $('#settings-dialog'),
    logDialog: $('#log-dialog'),
  };

  const defaults = {
    playerName: '주인공',
    bgmVolume: 45,
    voiceVolume: 85,
    showOriginal: false,
    autoplayVoice: true,
    dialogueVisible: true,
    dialogueStyle: 'novel',
    bgmEnabled: true,
    voiceEnabled: true,
  };

  const state = {
    data: null,
    stories: [],
    filtered: [],
    category: 'reading',
    readingPlan: null,
    readingStories: [],
    readingSectionByChapter: new Map(),
    readingIndexById: new Map(),
    categoryIndexById: new Map(),
    story: null,
    queue: [],
    cursor: 0,
    history: [],
    transcript: [],
    currentEvent: null,
    background: null,
    backgroundBlack: false,
    still: null,
    music: null,
    auto: false,
    autoTimer: null,
    settings: loadSettings(),
  };

  const bgmAudio = new Audio();
  bgmAudio.loop = true;
  bgmAudio.preload = 'none';
  const voiceAudio = new Audio();
  voiceAudio.preload = 'none';

  function loadSettings() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem('atelier-story-settings') || '{}') };
    } catch (_) {
      return { ...defaults };
    }
  }

  function saveSettings() {
    localStorage.setItem('atelier-story-settings', JSON.stringify(state.settings));
  }

  function assetUrl(relative) {
    return new URL(relative, document.baseURI).href;
  }

  function cleanText(text = '') {
    return String(text)
      .replace(/\[px\]/gi, state.settings.playerName || defaults.playerName)
      .replace(/\[(?:\/?(?:color|size|b|i|u|ruby|wait|speed|voice|name|p)|n|br)[^\]]*\]/gi, '')
      .replace(/\\n/g, '\n')
      .trim();
  }

  function plainChoice(text = '') {
    return cleanText(text).replace(/^「|」$/g, '').trim();
  }

  function categoryLabel(category) {
    if (category === 'reading') return '통합 순서';
    return category === 'main' ? '메인' : '사이드';
  }

  function setSidebar(open) {
    const isOpen = Boolean(open);
    elements.app.dataset.sidebar = isOpen ? 'open' : 'closed';
    elements.openLibrary.setAttribute('aria-expanded', String(isOpen));
    elements.openLibrary.setAttribute('aria-label', isOpen ? '스토리 목록 닫기' : '스토리 목록 열기');
  }

  function isCompact() {
    return window.innerWidth <= 860 || window.innerHeight <= 590;
  }

  function storyListForCategory(category = state.category) {
    if (category === 'reading') return state.readingStories;
    return state.readingStories.filter((story) => story.category === category);
  }

  function storySearchText(story) {
    const section = state.readingSectionByChapter.get(story.chapter);
    return [
      story.title.ko,
      story.title.ja,
      story.description.ko,
      story.description.ja,
      section?.label,
      section?.summary,
      story.id,
      `${story.chapter}장`,
    ].join(' ');
  }

  function storyCardNumber(story) {
    const index = state.category === 'reading'
      ? state.readingIndexById.get(story.id)
      : state.categoryIndexById.get(story.id);
    return String(Number.isInteger(index) ? index + 1 : 0).padStart(2, '0');
  }

  function renderStoryList() {
    const query = elements.search.value.trim().toLocaleLowerCase('ko');
    state.filtered = storyListForCategory().filter((story) => {
      if (!query) return true;
      return storySearchText(story).toLocaleLowerCase('ko').includes(query);
    });

    elements.storyList.replaceChildren();
    if (!state.filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'list-empty';
      empty.textContent = '검색 조건에 맞는 이야기가 없습니다.';
      elements.storyList.append(empty);
      return;
    }

    let chapter = null;
    let previousCategory = null;
    for (const story of state.filtered) {
      if (chapter !== story.chapter) {
        chapter = story.chapter;
        previousCategory = null;
        const section = state.readingSectionByChapter.get(chapter);
        const heading = document.createElement('p');
        heading.className = 'story-list__chapter';
        heading.textContent = state.category === 'reading'
          ? section?.label || `CHAPTER ${story.chapter}`
          : `${categoryLabel(story.category)} · CHAPTER ${story.chapter}`;
        elements.storyList.append(heading);
        if (state.category === 'reading' && section?.summary) {
          const summary = document.createElement('p');
          summary.className = 'story-list__summary';
          summary.textContent = section.summary;
          elements.storyList.append(summary);
        }
      }

      if (state.category === 'reading' && previousCategory !== story.category) {
        const category = document.createElement('p');
        category.className = 'story-list__category';
        category.textContent = `${categoryLabel(story.category)} 스토리`;
        elements.storyList.append(category);
      }

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `story-card${state.story?.id === story.id ? ' is-active' : ''}`;
      card.dataset.storyId = story.id;
      card.innerHTML = `
        <span class="story-card__number">${String(story.number).padStart(2, '0')}</span>
        <span><strong></strong><small></small></span>
        <span class="story-card__arrow" aria-hidden="true">›</span>`;
      card.querySelector('strong').textContent = story.title.ko || story.title.ja;
      card.querySelector('small').textContent = story.title.ja;
      card.querySelector('.story-card__number').textContent = storyCardNumber(story);
      card.addEventListener('click', () => startStory(story.id));
      elements.storyList.append(card);
      previousCategory = story.category;
    }
  }

  function syncCategoryTabs() {
    $$('.story-tab').forEach((tab) => {
      const active = tab.dataset.category === state.category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
  }

  function stopAutoTimer() {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }

  function stopVoice() {
    voiceAudio.pause();
    voiceAudio.removeAttribute('src');
    elements.voiceIndicator.classList.remove('is-playing');
  }

  function syncVoiceReplayButton() {
    const event = state.currentEvent;
    const canReplay = Boolean(event?.voice && ['talk', 'player'].includes(event.type));
    elements.replayVoice.disabled = !canReplay || !state.settings.voiceEnabled;
    elements.replayVoice.setAttribute(
      'aria-label',
      canReplay ? '현재 대사 음성 다시 재생' : '현재 대사에 재생할 음성이 없습니다',
    );
  }

  function applyBackground(image, black = false) {
    state.background = image || null;
    state.backgroundBlack = Boolean(black);
    elements.background.classList.toggle('is-black', state.backgroundBlack);
    elements.background.style.backgroundImage = image ? `url("${assetUrl(image)}")` : 'none';
    if (image || black) applyStill(null);
  }

  function applyStill(image) {
    state.still = image || null;
    elements.still.hidden = !image;
    if (image) elements.still.src = assetUrl(image);
    else elements.still.removeAttribute('src');
  }

  function applyMusic(audio) {
    state.music = audio || null;
    if (!audio || !state.settings.bgmEnabled) {
      bgmAudio.pause();
      if (!audio) bgmAudio.removeAttribute('src');
      return;
    }
    const url = assetUrl(audio);
    if (bgmAudio.src !== url) {
      bgmAudio.src = url;
      bgmAudio.currentTime = 0;
    }
    bgmAudio.volume = state.settings.bgmVolume / 100;
    bgmAudio.play().catch(() => {});
  }

  function playVoice(audio, force = false) {
    stopVoice();
    elements.voiceIndicator.hidden = !audio;
    if (!audio || !state.settings.voiceEnabled || (!force && !state.settings.autoplayVoice)) {
      if (state.auto) scheduleAutoAdvance(1900);
      return;
    }
    voiceAudio.src = assetUrl(audio);
    voiceAudio.volume = state.settings.voiceVolume / 100;
    elements.voiceIndicator.classList.add('is-playing');
    voiceAudio.play().catch(() => {
      elements.voiceIndicator.classList.remove('is-playing');
      if (state.auto) scheduleAutoAdvance(2100);
    });
  }

  function replayVoice() {
    const audio = state.currentEvent?.voice;
    if (!audio || !state.settings.voiceEnabled) return;
    playVoice(audio, true);
  }

  function syncDialogueVisibility() {
    const visible = Boolean(state.settings.dialogueVisible);
    elements.stage.dataset.dialogue = visible ? 'visible' : 'hidden';
    elements.toggleDialogue.classList.toggle('is-active', visible);
    elements.toggleDialogue.setAttribute('aria-pressed', String(visible));
    elements.toggleDialogue.setAttribute('aria-label', visible ? '대사 숨기기' : '대사 표시');
  }

  function syncDialogueStyle() {
    const availableStyles = ['novel', 'cinema', 'youtube'];
    const style = availableStyles.includes(state.settings.dialogueStyle)
      ? state.settings.dialogueStyle
      : defaults.dialogueStyle;
    state.settings.dialogueStyle = style;
    elements.stage.dataset.dialogueStyle = style;
    $('#dialogue-style').value = style;
  }

  function scheduleAutoAdvance(delay) {
    stopAutoTimer();
    if (!state.auto || state.currentEvent?.type === 'choice') return;
    state.autoTimer = setTimeout(goNext, delay);
  }

  function appendTranscript(speaker, ko, ja) {
    if (!ko && !ja) return;
    state.transcript.push({ speaker, ko, ja });
  }

  function renderLog() {
    elements.log.replaceChildren();
    if (!state.transcript.length) {
      const empty = document.createElement('p');
      empty.className = 'log-empty';
      empty.textContent = '아직 표시된 대사가 없습니다.';
      elements.log.append(empty);
      return;
    }
    for (const item of state.transcript) {
      const entry = document.createElement('article');
      entry.className = 'log-entry';
      const speaker = document.createElement('strong');
      speaker.textContent = item.speaker;
      const ko = document.createElement('p');
      ko.textContent = item.ko;
      entry.append(speaker, ko);
      if (state.settings.showOriginal && item.ja) {
        const ja = document.createElement('small');
        ja.textContent = item.ja;
        entry.append(ja);
      }
      elements.log.append(entry);
    }
  }

  function countDisplays(events) {
    return events.reduce((count, event) => (
      count + (['talk', 'player', 'choice', 'still'].includes(event.type) ? 1 : 0)
    ), 0);
  }

  function renderProgress() {
    const total = Math.max(1, countDisplays(state.queue));
    const current = Math.min(total, state.history.length + 1);
    elements.progress.textContent = `${current} / ${total}`;
  }

  function renderCharacter(event) {
    const image = event?.type === 'talk' ? event.character : null;
    elements.character.hidden = !image || Boolean(state.still);
    if (image) {
      elements.character.src = assetUrl(image);
      elements.character.alt = `${event.speaker.ko} 캐릭터 일러스트`;
    } else {
      elements.character.removeAttribute('src');
      elements.character.alt = '';
    }
  }

  function renderDialogue(event, log = true) {
    const isPlayer = event.type === 'player';
    const speaker = isPlayer ? state.settings.playerName : event.speaker.ko;
    const ko = cleanText(event.ko || (isPlayer ? '…' : ''));
    const ja = cleanText(event.ja || '');
    elements.speaker.textContent = speaker;
    elements.ko.textContent = ko;
    elements.ja.textContent = ja;
    elements.ja.hidden = !state.settings.showOriginal || !ja;
    elements.voiceIndicator.hidden = !event.voice;
    elements.dialoguePanel.hidden = false;
    elements.choicePanel.hidden = true;
    renderCharacter(event);
    renderProgress();
    if (log) appendTranscript(speaker, ko, ja);
    playVoice(event.voice);
    syncVoiceReplayButton();
  }

  function renderStill(event) {
    applyStill(event.image);
    elements.speaker.textContent = '장면 일러스트';
    elements.ko.textContent = '화면을 눌러 다음 장면으로 이동하세요.';
    elements.ja.textContent = '';
    elements.ja.hidden = true;
    elements.voiceIndicator.hidden = true;
    elements.dialoguePanel.hidden = false;
    elements.choicePanel.hidden = true;
    renderCharacter(null);
    renderProgress();
    syncVoiceReplayButton();
    if (state.auto) scheduleAutoAdvance(2800);
  }

  function renderChoice(event) {
    stopAutoTimer();
    stopVoice();
    elements.dialoguePanel.hidden = true;
    elements.choicePanel.hidden = false;
    elements.choiceList.replaceChildren();
    event.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice-button';
      button.textContent = cleanText(option.ko || option.ja);
      button.addEventListener('click', () => chooseOption(index));
      elements.choiceList.append(button);
    });
    renderProgress();
    syncVoiceReplayButton();
  }

  function renderCurrent(log = true) {
    const event = state.currentEvent;
    if (!event) return;
    if (event.type === 'choice') renderChoice(event);
    else if (event.type === 'still') renderStill(event);
    else renderDialogue(event, log);
  }

  function processUntilDisplay() {
    stopAutoTimer();
    while (state.cursor < state.queue.length) {
      const event = state.queue[state.cursor];
      if (event.type === 'background') {
        applyBackground(event.image, event.black);
        state.cursor += 1;
      } else if (event.type === 'music') {
        applyMusic(event.audio);
        state.cursor += 1;
      } else {
        state.currentEvent = event;
        renderCurrent();
        return;
      }
    }
    showComplete();
  }

  function captureSnapshot() {
    return {
      queue: state.queue.slice(),
      cursor: state.cursor,
      currentEvent: state.currentEvent,
      background: state.background,
      backgroundBlack: state.backgroundBlack,
      still: state.still,
      music: state.music,
    };
  }

  function restoreSnapshot(snapshot) {
    stopAutoTimer();
    stopVoice();
    state.queue = snapshot.queue.slice();
    state.cursor = snapshot.cursor;
    state.currentEvent = snapshot.currentEvent;
    applyBackground(snapshot.background, snapshot.backgroundBlack);
    applyStill(snapshot.still);
    applyMusic(snapshot.music);
    elements.complete.hidden = true;
    renderCurrent(false);
  }

  function goNext() {
    if (!state.story || !state.currentEvent || state.currentEvent.type === 'choice') return;
    state.history.push(captureSnapshot());
    stopVoice();
    state.cursor += 1;
    state.currentEvent = null;
    processUntilDisplay();
  }

  function goPrevious() {
    const snapshot = state.history.pop();
    if (snapshot) restoreSnapshot(snapshot);
  }

  function chooseOption(index) {
    const choice = state.currentEvent;
    const option = choice?.options?.[index];
    if (!option) return;
    state.history.push(captureSnapshot());
    const branch = JSON.parse(JSON.stringify(option.events || []));
    const protagonist = branch.find((event) => event.type === 'player');
    const response = { ja: plainChoice(option.ja), ko: plainChoice(option.ko || option.ja) };
    if (protagonist) Object.assign(protagonist, response);
    else branch.unshift({ type: 'player', speaker: '주인공', ...response, voice: null });
    state.queue = [
      ...state.queue.slice(0, state.cursor),
      ...branch,
      ...state.queue.slice(state.cursor + 1),
    ];
    state.currentEvent = null;
    elements.choicePanel.hidden = true;
    processUntilDisplay();
  }

  function nextReadingStory() {
    const index = state.readingIndexById.get(state.story?.id);
    if (!Number.isInteger(index)) return null;
    return state.readingStories[index + 1] || null;
  }

  function showComplete() {
    stopVoice();
    stopAutoTimer();
    state.currentEvent = null;
    elements.dialoguePanel.hidden = true;
    elements.choicePanel.hidden = true;
    elements.complete.hidden = false;
    syncVoiceReplayButton();
    elements.completeTitle.textContent = state.story.title.ko;
    const next = nextReadingStory();
    elements.nextStory.hidden = !next;
    elements.nextStory.disabled = !next;
    elements.completeNext.textContent = next
      ? `통합 순서 다음: ${categoryLabel(next.category)} ${next.chapter}장 · ${next.title.ko}`
      : '통합 읽기 순서를 모두 읽었습니다.';
    localStorage.setItem('atelier-story-last', state.story.id);
  }

  function resetScene() {
    stopVoice();
    stopAutoTimer();
    bgmAudio.pause();
    bgmAudio.removeAttribute('src');
    state.background = null;
    state.backgroundBlack = false;
    state.still = null;
    state.music = null;
    state.history = [];
    state.transcript = [];
    state.currentEvent = null;
    applyBackground(null, false);
    applyStill(null);
    elements.character.hidden = true;
    elements.complete.hidden = true;
    elements.completeNext.textContent = '';
    elements.nextStory.hidden = false;
    elements.nextStory.disabled = false;
    elements.choicePanel.hidden = true;
    renderLog();
    syncVoiceReplayButton();
  }

  function startStory(id, updateHash = true) {
    const story = state.stories.find((item) => item.id === id);
    if (!story) return;
    resetScene();
    state.story = story;
    state.queue = story.events.slice();
    state.cursor = 0;
    elements.welcome.hidden = true;
    elements.stage.hidden = false;
    elements.storyKind.textContent = `${categoryLabel(story.category)} · ${story.chapter}장`;
    elements.storyTitle.textContent = story.title.ko || story.title.ja;
    syncCategoryTabs();
    renderStoryList();
    if (updateHash) history.replaceState(null, '', `#/story/${encodeURIComponent(story.id)}`);
    if (isCompact()) setSidebar(false);
    processUntilDisplay();
  }

  function startNextStory() {
    const next = nextReadingStory();
    if (!next) return;
    state.category = 'reading';
    startStory(next.id);
  }

  function setCategory(category) {
    state.category = category;
    syncCategoryTabs();
    renderStoryList();
  }

  function configureReadingPlan(plan) {
    if (!plan || !Array.isArray(plan.sections) || !plan.sections.length) {
      throw new Error('통합 읽기 순서 데이터가 없습니다.');
    }

    const categoryOrder = Array.isArray(plan.categoryOrder) ? plan.categoryOrder : ['main', 'side'];
    const categoryRank = new Map(categoryOrder.map((category, index) => [category, index]));
    if (categoryRank.size !== 2 || !categoryRank.has('main') || !categoryRank.has('side')) {
      throw new Error('통합 읽기 순서의 카테고리 규칙이 올바르지 않습니다.');
    }

    const chapterRank = new Map();
    state.readingSectionByChapter = new Map();
    plan.sections.forEach((section, index) => {
      const chapter = Number(section.chapter);
      if (!Number.isInteger(chapter) || chapterRank.has(chapter)) {
        throw new Error('통합 읽기 순서의 장 정보가 중복되었거나 잘못되었습니다.');
      }
      chapterRank.set(chapter, index);
      state.readingSectionByChapter.set(chapter, { ...section, chapter });
    });

    for (const story of state.stories) {
      if (!chapterRank.has(story.chapter) || !categoryRank.has(story.category) || !Number.isFinite(Number(story.questId))) {
        throw new Error(`통합 읽기 순서에 넣을 수 없는 이야기입니다: ${story.id}`);
      }
    }

    state.readingStories = [...state.stories].sort((left, right) => (
      chapterRank.get(left.chapter) - chapterRank.get(right.chapter)
      || categoryRank.get(left.category) - categoryRank.get(right.category)
      || Number(left.questId) - Number(right.questId)
    ));

    if (new Set(state.readingStories.map((story) => story.id)).size !== state.stories.length) {
      throw new Error('통합 읽기 순서에 중복된 이야기가 있습니다.');
    }

    state.readingIndexById = new Map(state.readingStories.map((story, index) => [story.id, index]));
    state.categoryIndexById = new Map();
    for (const category of categoryOrder) {
      state.readingStories
        .filter((story) => story.category === category)
        .forEach((story, index) => state.categoryIndexById.set(story.id, index));
    }
  }

  function translationEntryAt(items, index, context) {
    const entry = items?.[Number(index)];
    if (!entry) throw new Error(`번역 대상이 없습니다: ${context}`);
    return entry;
  }

  function applyEventTranslations(event, patch, context) {
    if (typeof patch.ko === 'string') event.ko = patch.ko;
    if (!patch.options) return;

    for (const [optionIndex, optionPatch] of Object.entries(patch.options)) {
      const option = translationEntryAt(event.options, optionIndex, `${context}.options[${optionIndex}]`);
      if (typeof optionPatch.ko === 'string') option.ko = optionPatch.ko;
      if (!optionPatch.events) continue;
      for (const [eventIndex, eventPatch] of Object.entries(optionPatch.events)) {
        const nested = translationEntryAt(option.events, eventIndex, `${context}.options[${optionIndex}].events[${eventIndex}]`);
        applyEventTranslations(nested, eventPatch, `${context}.options[${optionIndex}].events[${eventIndex}]`);
      }
    }
  }

  function applyKoreanTranslations(data, translationFile) {
    const patches = translationFile?.stories;
    if (!patches || typeof patches !== 'object') return;

    const storiesById = new Map(data.stories.map((story) => [story.id, story]));
    for (const [storyId, patch] of Object.entries(patches)) {
      const story = storiesById.get(storyId);
      if (!story) throw new Error(`번역 대상 이야기가 없습니다: ${storyId}`);
      if (typeof patch.title === 'string') story.title.ko = patch.title;
      if (typeof patch.description === 'string') story.description.ko = patch.description;
      if (!patch.events) continue;
      for (const [eventIndex, eventPatch] of Object.entries(patch.events)) {
        const event = translationEntryAt(story.events, eventIndex, `${storyId}.events[${eventIndex}]`);
        applyEventTranslations(event, eventPatch, `${storyId}.events[${eventIndex}]`);
      }
    }
  }

  function syncControls() {
    bgmAudio.volume = state.settings.bgmVolume / 100;
    voiceAudio.volume = state.settings.voiceVolume / 100;
    $('#player-name').value = state.settings.playerName;
    $('#bgm-volume').value = state.settings.bgmVolume;
    $('#voice-volume').value = state.settings.voiceVolume;
    $('#bgm-volume-output').value = `${state.settings.bgmVolume}%`;
    $('#voice-volume-output').value = `${state.settings.voiceVolume}%`;
    syncDialogueStyle();
    $('#show-original').checked = state.settings.showOriginal;
    $('#autoplay-voice').checked = state.settings.autoplayVoice;
    $('#toggle-bgm').classList.toggle('is-active', state.settings.bgmEnabled);
    $('#toggle-bgm').setAttribute('aria-pressed', String(state.settings.bgmEnabled));
    $('#toggle-voice').classList.toggle('is-active', state.settings.voiceEnabled);
    $('#toggle-voice').setAttribute('aria-pressed', String(state.settings.voiceEnabled));
    $('#toggle-auto').setAttribute('aria-pressed', String(state.auto));
    syncDialogueVisibility();
    syncVoiceReplayButton();
    if (state.currentEvent && ['talk', 'player'].includes(state.currentEvent.type)) renderCurrent(false);
  }

  function toggleBgm() {
    state.settings.bgmEnabled = !state.settings.bgmEnabled;
    saveSettings();
    if (state.settings.bgmEnabled) applyMusic(state.music);
    else bgmAudio.pause();
    syncControls();
  }

  function toggleVoice() {
    state.settings.voiceEnabled = !state.settings.voiceEnabled;
    saveSettings();
    if (!state.settings.voiceEnabled) stopVoice();
    syncControls();
  }

  function toggleDialogue() {
    state.settings.dialogueVisible = !state.settings.dialogueVisible;
    saveSettings();
    syncControls();
  }

  function toggleAuto() {
    state.auto = !state.auto;
    syncControls();
    if (!state.auto) stopAutoTimer();
    else if (voiceAudio.paused) scheduleAutoAdvance(1800);
  }

  function bindEvents() {
    $$('.story-tab').forEach((tab) => tab.addEventListener('click', () => setCategory(tab.dataset.category)));
    elements.search.addEventListener('input', renderStoryList);
    elements.openLibrary.addEventListener('click', () => setSidebar(elements.app.dataset.sidebar !== 'open'));
    $('#close-library').addEventListener('click', () => setSidebar(false));
    $('#sidebar-scrim').addEventListener('click', () => setSidebar(false));
    $('#open-first-story').addEventListener('click', () => startStory(state.readingStories[0]?.id));
    $('#previous-line').addEventListener('click', (event) => { event.stopPropagation(); goPrevious(); });
    $('#next-line').addEventListener('click', (event) => { event.stopPropagation(); goNext(); });
    $('#toggle-auto').addEventListener('click', (event) => { event.stopPropagation(); toggleAuto(); });
    elements.dialoguePanel.addEventListener('click', (event) => {
      if (!event.target.closest('button')) goNext();
    });
    $('#toggle-bgm').addEventListener('click', toggleBgm);
    $('#toggle-voice').addEventListener('click', toggleVoice);
    elements.replayVoice.addEventListener('click', replayVoice);
    elements.toggleDialogue.addEventListener('click', toggleDialogue);
    $('#open-settings').addEventListener('click', () => elements.settingsDialog.showModal());
    $('#open-log').addEventListener('click', () => { renderLog(); elements.logDialog.showModal(); });
    $('#replay-story').addEventListener('click', () => startStory(state.story.id));
    $('#next-story').addEventListener('click', startNextStory);
    $('#toggle-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    $('#dismiss-orientation').addEventListener('click', () => document.body.classList.add('orientation-dismissed'));

    $('#player-name').addEventListener('input', (event) => {
      state.settings.playerName = event.target.value.trim() || defaults.playerName;
      saveSettings();
      syncControls();
    });
    $('#bgm-volume').addEventListener('input', (event) => {
      state.settings.bgmVolume = Number(event.target.value);
      saveSettings();
      syncControls();
    });
    $('#voice-volume').addEventListener('input', (event) => {
      state.settings.voiceVolume = Number(event.target.value);
      saveSettings();
      syncControls();
    });
    $('#show-original').addEventListener('change', (event) => {
      state.settings.showOriginal = event.target.checked;
      saveSettings();
      syncControls();
    });
    $('#autoplay-voice').addEventListener('change', (event) => {
      state.settings.autoplayVoice = event.target.checked;
      saveSettings();
    });
    $('#dialogue-style').addEventListener('change', (event) => {
      state.settings.dialogueStyle = event.target.value;
      saveSettings();
      syncControls();
    });

    elements.stage.addEventListener('click', (event) => {
      if (state.settings.dialogueVisible) return;
      if (event.target.closest?.('button, .reader-bar, .choice-panel, .story-complete')) return;
      goNext();
    });

    voiceAudio.addEventListener('ended', () => {
      elements.voiceIndicator.classList.remove('is-playing');
      if (state.auto) scheduleAutoAdvance(750);
    });

    document.addEventListener('keydown', (event) => {
      if (event.target.matches('input') || $('.modal[open]')) return;
      if (['ArrowRight', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      } else if (event.key.toLowerCase() === 'a') {
        toggleAuto();
      } else if (event.key.toLowerCase() === 'l') {
        setSidebar(elements.app.dataset.sidebar !== 'open');
      }
    });

    let wasCompact = isCompact();
    window.addEventListener('resize', () => {
      const compact = isCompact();
      if (compact !== wasCompact) {
        setSidebar(!compact);
        wasCompact = compact;
      }
    });
  }

  async function init() {
    bindEvents();
    syncControls();
    setSidebar(!isCompact());
    try {
      const [storyResponse, planResponse, translationResponse] = await Promise.all([
        fetch('data/stories.json'),
        fetch('data/reading-plan.json'),
        fetch('data/ko-translations.json'),
      ]);
      if (!storyResponse.ok) throw new Error(`stories.json: HTTP ${storyResponse.status}`);
      if (!planResponse.ok) throw new Error(`reading-plan.json: HTTP ${planResponse.status}`);
      if (!translationResponse.ok) throw new Error(`ko-translations.json: HTTP ${translationResponse.status}`);
      state.data = await storyResponse.json();
      state.readingPlan = await planResponse.json();
      const translationFile = await translationResponse.json();
      applyKoreanTranslations(state.data, translationFile);
      const translationPaths = Array.isArray(translationFile.files) ? translationFile.files : [];
      const translationFiles = await Promise.all(translationPaths.map(async (path) => {
        if (typeof path !== 'string' || !path.startsWith('translations/')) {
          throw new Error('번역 파일 경로가 올바르지 않습니다.');
        }
        const response = await fetch(`data/${path}`);
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return response.json();
      }));
      translationFiles.forEach((file) => applyKoreanTranslations(state.data, file));
      state.stories = state.data.stories;
      configureReadingPlan(state.readingPlan);
      $('#reading-count').textContent = state.readingStories.length;
      $('#main-count').textContent = state.data.meta.mainStories;
      $('#side-count').textContent = state.data.meta.sideStories;
      $('#story-total').textContent = state.data.meta.stories;
      renderStoryList();

      const route = decodeURIComponent(location.hash).match(/^#\/story\/(.+)$/);
      const last = localStorage.getItem('atelier-story-last');
      if (route && state.stories.some((story) => story.id === route[1])) {
        startStory(route[1], false);
      } else if (last && location.hash === '#/resume') {
        startStory(last);
      }
    } catch (error) {
      console.error(error);
      elements.storyList.innerHTML = '<p class="list-empty">스토리 데이터를 불러오지 못했습니다.<br>페이지를 새로고침해 주세요.</p>';
      $('#open-first-story').disabled = true;
    }
  }

  init();
})();
