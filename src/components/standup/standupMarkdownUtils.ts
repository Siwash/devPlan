export interface CaretRange {
  start: number;
  end: number;
}

export type MarkdownInsertMode = 'insert' | 'append' | 'noop';

export interface InsertMarkdownBlockResult {
  mode: MarkdownInsertMode;
  nextContent: string;
  nextCaret: number | null;
}

export const splitMarkdownParagraphs = (content: string): string[] =>
  content
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

const isValidCaret = (caret: CaretRange, contentLength: number): boolean => {
  if (!Number.isInteger(caret.start) || !Number.isInteger(caret.end)) {
    return false;
  }
  if (caret.start < 0 || caret.end < 0) {
    return false;
  }
  if (caret.start > contentLength || caret.end > contentLength) {
    return false;
  }
  if (caret.end < caret.start) {
    return false;
  }
  return true;
};

export const insertMarkdownBlock = (
  content: string,
  rawBlock: string,
  caret: CaretRange | null,
): InsertMarkdownBlockResult => {
  if (!rawBlock.trim()) {
    return {
      mode: 'noop',
      nextContent: content,
      nextCaret: null,
    };
  }

  if (caret && isValidCaret(caret, content.length)) {
    const nextContent = `${content.slice(0, caret.start)}${rawBlock}${content.slice(caret.end)}`;
    return {
      mode: 'insert',
      nextContent,
      nextCaret: caret.start + rawBlock.length,
    };
  }

  const separator = content.trim() ? '\n\n' : '';
  const nextContent = `${content}${separator}${rawBlock}`;
  return {
    mode: 'append',
    nextContent,
    nextCaret: nextContent.length,
  };
};
