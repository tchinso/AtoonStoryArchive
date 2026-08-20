import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'public', 'data');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const errors = [];
const fail = (message) => errors.push(message);

const storyData = readJson('stories.json');
const readingPlan = readJson('reading-plan.json');
const translationIndex = readJson('ko-translations.json');
const storiesById = new Map(storyData.stories.map((story) => [story.id, story]));
let translatedTextCount = 0;
const translatedStoryIds = new Set();
let totalTranslatableTextCount = 0;

function countTranslatableEvent(event) {
  if (typeof event.ja === 'string' && event.ja.trim()) totalTranslatableTextCount += 1;
  for (const option of event.options || []) {
    if (typeof option.ja === 'string' && option.ja.trim()) totalTranslatableTextCount += 1;
    for (const nested of option.events || []) countTranslatableEvent(nested);
  }
}

for (const story of storyData.stories) {
  if (typeof story.title?.ja === 'string' && story.title.ja.trim()) totalTranslatableTextCount += 1;
  if (typeof story.description?.ja === 'string' && story.description.ja.trim()) totalTranslatableTextCount += 1;
  for (const event of story.events) countTranslatableEvent(event);
}

function readIndexed(items, index, context) {
  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || !Array.isArray(items) || !items[numericIndex]) {
    fail(`Missing source entry: ${context}`);
    return null;
  }
  return items[numericIndex];
}

function validateEventPatch(event, patch, context) {
  if (!patch || typeof patch !== 'object') {
    fail(`Invalid patch: ${context}`);
    return;
  }
  if ('ko' in patch) {
    if (typeof patch.ko !== 'string' || !patch.ko.trim()) fail(`Empty Korean translation: ${context}.ko`);
    else translatedTextCount += 1;
  }
  if (!patch.options) return;
  if (!event.options) {
    fail(`Options patch on a non-choice event: ${context}`);
    return;
  }
  for (const [optionIndex, optionPatch] of Object.entries(patch.options)) {
    const option = readIndexed(event.options, optionIndex, `${context}.options[${optionIndex}]`);
    if (!option || !optionPatch || typeof optionPatch !== 'object') continue;
    if ('ko' in optionPatch) {
      if (typeof optionPatch.ko !== 'string' || !optionPatch.ko.trim()) fail(`Empty Korean translation: ${context}.options[${optionIndex}].ko`);
      else translatedTextCount += 1;
    }
    if (!optionPatch.events) continue;
    for (const [nestedIndex, nestedPatch] of Object.entries(optionPatch.events)) {
      const nested = readIndexed(option.events, nestedIndex, `${context}.options[${optionIndex}].events[${nestedIndex}]`);
      if (nested) validateEventPatch(nested, nestedPatch, `${context}.options[${optionIndex}].events[${nestedIndex}]`);
    }
  }
}

function validateTranslationFile(file, relativePath) {
  if (!file || typeof file !== 'object' || !file.stories || typeof file.stories !== 'object') {
    fail(`Invalid translation file: ${relativePath}`);
    return;
  }
  for (const [storyId, patch] of Object.entries(file.stories)) {
    const story = storiesById.get(storyId);
    if (!story) {
      fail(`Unknown story in ${relativePath}: ${storyId}`);
      continue;
    }
    translatedStoryIds.add(storyId);
    if ('title' in patch) {
      if (typeof patch.title !== 'string' || !patch.title.trim()) fail(`Empty title translation: ${storyId}`);
      else translatedTextCount += 1;
    }
    if ('description' in patch) {
      if (typeof patch.description !== 'string' || !patch.description.trim()) fail(`Empty description translation: ${storyId}`);
      else translatedTextCount += 1;
    }
    if (!patch.events) continue;
    for (const [eventIndex, eventPatch] of Object.entries(patch.events)) {
      const event = readIndexed(story.events, eventIndex, `${storyId}.events[${eventIndex}]`);
      if (event) validateEventPatch(event, eventPatch, `${storyId}.events[${eventIndex}]`);
    }
  }
}

const sections = readingPlan.sections;
if (!Array.isArray(sections) || !sections.length) fail('Reading plan has no sections.');
const chapterRank = new Map();
for (const [index, section] of sections.entries()) {
  if (!Number.isInteger(section.chapter) || chapterRank.has(section.chapter)) fail(`Invalid reading-plan chapter: ${section.chapter}`);
  chapterRank.set(section.chapter, index);
  if (typeof section.label !== 'string' || typeof section.summary !== 'string') fail(`Incomplete reading-plan note: chapter ${section.chapter}`);
}

const categoryRank = new Map((readingPlan.categoryOrder || []).map((category, index) => [category, index]));
if (!categoryRank.has('main') || !categoryRank.has('side')) fail('Reading plan must order main and side stories.');
for (const story of storyData.stories) {
  if (!chapterRank.has(story.chapter)) fail(`Story missing from reading plan: ${story.id}`);
  if (!categoryRank.has(story.category)) fail(`Unknown story category: ${story.id}`);
  if (!Number.isFinite(Number(story.questId))) fail(`Invalid quest ID: ${story.id}`);
}

const readingOrder = [...storyData.stories].sort((left, right) => (
  chapterRank.get(left.chapter) - chapterRank.get(right.chapter)
  || categoryRank.get(left.category) - categoryRank.get(right.category)
  || Number(left.questId) - Number(right.questId)
));
if (new Set(readingOrder.map((story) => story.id)).size !== storyData.stories.length) fail('Reading order contains duplicate stories.');

validateTranslationFile(translationIndex, 'ko-translations.json');
if (!Array.isArray(translationIndex.files)) fail('Translation index must contain a files array.');
for (const relativePath of translationIndex.files || []) {
  if (typeof relativePath !== 'string' || !relativePath.startsWith('translations/')) {
    fail(`Invalid translation import path: ${relativePath}`);
    continue;
  }
  validateTranslationFile(readJson(relativePath), relativePath);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  stories: storyData.stories.length,
  readingOrder: readingOrder.length,
  firstStory: readingOrder[0].id,
  lastStory: readingOrder.at(-1).id,
  translationFiles: (translationIndex.files || []).length + 1,
  reviewedStories: translatedStoryIds.size,
  reviewedTextEntries: translatedTextCount,
  totalTextEntries: totalTranslatableTextCount,
  reviewedCoverage: `${((translatedTextCount / totalTranslatableTextCount) * 100).toFixed(1)}%`,
}, null, 2));
