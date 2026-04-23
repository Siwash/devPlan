import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHistoryReferenceMarkdown,
  buildTodoImportMarkdown,
  insertMarkdownBlock,
  isTaskPlannedForDate,
  parseHistoryReference,
  serializeHistoryReference,
  splitMarkdownParagraphs,
} from './standupMarkdownUtils.ts';

test('splitMarkdownParagraphs splits by blank lines and trims blocks', () => {
  const content = '  第一段\n内容\n\n\n  第二段  \n\n\n\n第三段\n';
  assert.deepEqual(splitMarkdownParagraphs(content), ['第一段\n内容', '第二段', '第三段']);
});

test('insertMarkdownBlock inserts at caret start', () => {
  const result = insertMarkdownBlock('World', 'Hello ', { start: 0, end: 0 });
  assert.equal(result.mode, 'insert');
  assert.equal(result.nextContent, 'Hello World');
  assert.equal(result.nextCaret, 6);
});

test('insertMarkdownBlock inserts at caret middle', () => {
  const result = insertMarkdownBlock('Hello World', 'Brave ', { start: 6, end: 6 });
  assert.equal(result.mode, 'insert');
  assert.equal(result.nextContent, 'Hello Brave World');
  assert.equal(result.nextCaret, 12);
});

test('insertMarkdownBlock inserts at caret end', () => {
  const result = insertMarkdownBlock('Hello', ' World', { start: 5, end: 5 });
  assert.equal(result.mode, 'insert');
  assert.equal(result.nextContent, 'Hello World');
  assert.equal(result.nextCaret, 11);
});

test('insertMarkdownBlock preserves markdown indentation and trailing spaces', () => {
  const block = '  - item one\n    - nested item  \n';
  const result = insertMarkdownBlock('## Notes', block, null);
  assert.equal(result.mode, 'append');
  assert.equal(result.nextContent, `## Notes\n\n${block}`);
  assert.equal(result.nextCaret, result.nextContent.length);
});

test('insertMarkdownBlock noops for all-whitespace blocks', () => {
  const result = insertMarkdownBlock('Alpha', '   \n\t  ', { start: 2, end: 2 });
  assert.equal(result.mode, 'noop');
  assert.equal(result.nextContent, 'Alpha');
  assert.equal(result.nextCaret, null);
});

test('insertMarkdownBlock falls back to append when caret is out of range', () => {
  const result = insertMarkdownBlock('Alpha', 'Beta', { start: 999, end: 999 });
  assert.equal(result.mode, 'append');
  assert.equal(result.nextContent, 'Alpha\n\nBeta');
  assert.equal(result.nextCaret, result.nextContent.length);
});

test('history reference payload can round-trip and render markdown quote', () => {
  const payload = {
    sourceDate: '2026-03-17',
    blockIndex: 1,
    blockText: '昨天推进了编辑器接入',
  };

  const serialized = serializeHistoryReference(payload);
  const parsed = parseHistoryReference(serialized);

  assert.deepEqual(parsed, payload);
  assert.equal(
    buildHistoryReferenceMarkdown(parsed, ''),
    '> 引用自 2026-03-17 · 段落 2\n>\n> 昨天推进了编辑器接入',
  );
});

test('invalid history reference payload falls back to null', () => {
  assert.equal(parseHistoryReference('{"broken":true}'), null);
  assert.equal(parseHistoryReference('not-json'), null);
});

test('isTaskPlannedForDate matches overlapping planned range', () => {
  assert.equal(isTaskPlannedForDate({ planned_start: '2026-03-17', planned_end: '2026-03-17' }, '2026-03-17'), true);
  assert.equal(isTaskPlannedForDate({ planned_start: '2026-03-16', planned_end: '2026-03-18' }, '2026-03-17'), true);
  assert.equal(isTaskPlannedForDate({ planned_start: '2026-03-18', planned_end: '2026-03-18' }, '2026-03-17'), false);
});

test('buildTodoImportMarkdown renders editable standup template for today tasks', () => {
  const markdown = buildTodoImportMarkdown([
    {
      id: 1,
      external_id: 'DEV-101',
      name: '接入 Markdown 编辑器',
      owner_name: '张三',
      status: '进行中',
      planned_start: '2026-03-17',
      planned_end: '2026-03-17',
    },
    {
      id: 2,
      name: '非当日任务',
      planned_start: '2026-03-20',
      planned_end: '2026-03-20',
    },
  ], '2026-03-17');

  assert.match(markdown, /## 2026-03-17 待办同步/);
  assert.match(markdown, /`DEV-101` 接入 Markdown 编辑器/);
  assert.match(markdown, /负责人：张三｜状态：进行中｜计划：2026-03-17 ~ 2026-03-17/);
  assert.match(markdown, /- 进度：/);
  assert.doesNotMatch(markdown, /非当日任务/);
});
