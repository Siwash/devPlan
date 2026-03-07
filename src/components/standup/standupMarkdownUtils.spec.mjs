import test from 'node:test';
import assert from 'node:assert/strict';

import { insertMarkdownBlock, splitMarkdownParagraphs } from './standupMarkdownUtils.ts';

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
