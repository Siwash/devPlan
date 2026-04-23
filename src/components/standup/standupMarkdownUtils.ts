import type { Task } from '../../lib/types';

export interface CaretRange {
  start: number;
  end: number;
}

export interface StandupHistoryReferencePayload {
  sourceDate: string;
  blockIndex: number;
  blockText: string;
}

export type MarkdownInsertMode = 'insert' | 'append' | 'noop';

export const STANDUP_REFERENCE_MIME = 'application/x-standup-markdown-reference';

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

const normalizeMarkdownBlock = (content: string): string => content.trim().replace(/\n{3,}/g, '\n\n');

export const serializeHistoryReference = (payload: StandupHistoryReferencePayload): string =>
  JSON.stringify(payload);

export const parseHistoryReference = (payload: string): StandupHistoryReferencePayload | null => {
  if (!payload.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<StandupHistoryReferencePayload>;
    if (
      typeof parsed.sourceDate !== 'string'
      || typeof parsed.blockIndex !== 'number'
      || typeof parsed.blockText !== 'string'
    ) {
      return null;
    }
    return {
      sourceDate: parsed.sourceDate,
      blockIndex: parsed.blockIndex,
      blockText: parsed.blockText,
    };
  } catch {
    return null;
  }
};

export const buildHistoryReferenceMarkdown = (
  payload: StandupHistoryReferencePayload | null,
  fallbackText: string,
): string => {
  const blockText = normalizeMarkdownBlock(payload?.blockText ?? fallbackText);
  if (!blockText) {
    return '';
  }

  if (!payload) {
    return blockText;
  }

  const quotedLines = blockText.split('\n').map((line) => `> ${line}`);
  return [`> 引用自 ${payload.sourceDate} · 段落 ${payload.blockIndex + 1}`, '>', ...quotedLines].join('\n');
};

export const isTaskPlannedForDate = (task: Pick<Task, 'planned_start' | 'planned_end'>, date: string): boolean => {
  if (!task.planned_start || !task.planned_end) {
    return false;
  }
  return task.planned_start <= date && task.planned_end >= date;
};

export const selectTasksForStandupDate = (tasks: Task[], date: string): Task[] => {
  return [...tasks]
    .filter((task) => isTaskPlannedForDate(task, date))
    .sort((left, right) => {
      const leftOwner = left.owner_name ?? '';
      const rightOwner = right.owner_name ?? '';
      if (leftOwner !== rightOwner) {
        return leftOwner.localeCompare(rightOwner, 'zh-CN');
      }

      const leftStart = left.planned_start ?? '';
      const rightStart = right.planned_start ?? '';
      if (leftStart !== rightStart) {
        return leftStart.localeCompare(rightStart);
      }

      const leftExternalId = left.external_id ?? '';
      const rightExternalId = right.external_id ?? '';
      if (leftExternalId !== rightExternalId) {
        return leftExternalId.localeCompare(rightExternalId);
      }

      return left.name.localeCompare(right.name, 'zh-CN');
    });
};

export const buildTodoImportMarkdown = (tasks: Task[], date: string): string => {
  const standupTasks = selectTasksForStandupDate(tasks, date);
  if (standupTasks.length === 0) {
    return '';
  }

  const lines: string[] = [
    `## ${date} 待办同步`,
    '',
    '> 可在每项下补充进度、风险和备注。',
    '',
  ];

  standupTasks.forEach((task, index) => {
    const headerSegments = [
      task.external_id ? `\`${task.external_id}\`` : null,
      task.name,
    ].filter((segment): segment is string => Boolean(segment));
    const metaSegments = [
      task.owner_name ? `负责人：${task.owner_name}` : null,
      task.status ? `状态：${task.status}` : null,
      task.planned_start && task.planned_end ? `计划：${task.planned_start} ~ ${task.planned_end}` : null,
    ].filter((segment): segment is string => Boolean(segment));

    lines.push(`${index + 1}. ${headerSegments.join(' ')}`);
    if (metaSegments.length > 0) {
      lines.push(`   - 概览：${metaSegments.join('｜')}`);
    }
    lines.push('   - 进度：');
    lines.push('   - 风险：');
    lines.push('   - 备注：');
    lines.push('');
  });

  return lines.join('\n').trim();
};

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
