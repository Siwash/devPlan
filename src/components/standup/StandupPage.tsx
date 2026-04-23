import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Button,
  Card,
  Empty,
  Popconfirm,
  Segmented,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, SaveOutlined, SyncOutlined } from '@ant-design/icons';
import type { PreviewType } from '@uiw/react-md-editor';
import dayjs from 'dayjs';

import { taskApi } from '../../lib/api';
import type { StandupDocument } from '../../lib/types';
import { useStandupStore } from '../../stores/standupStore';
import { StandupMarkdownEditor } from './StandupMarkdownEditor';
import {
  type StandupHistoryReferencePayload,
  buildHistoryReferenceMarkdown,
  buildTodoImportMarkdown,
  insertMarkdownBlock,
  selectTasksForStandupDate,
  splitMarkdownParagraphs,
} from './standupMarkdownUtils';

const { Title, Text } = Typography;

const DATE_FORMAT = 'YYYY-MM-DD';
const HISTORY_RANGE_DAYS = 180;
/** Minimum px the mouse must move before a mousedown becomes a drag. */
const DRAG_THRESHOLD_PX = 5;

interface CaretRange {
  start: number;
  end: number;
}

interface StandupHistoryBlockProps {
  payload: StandupHistoryReferencePayload;
  testId: string;
  onInsert: () => void;
  onMouseDown: React.MouseEventHandler<HTMLButtonElement>;
  isDragging: boolean;
}

const StandupHistoryBlock: React.FC<StandupHistoryBlockProps> = ({ payload, testId, onInsert, onMouseDown, isDragging }) => {
  return (
    <button
      type="button"
      className={`standup-history-block${isDragging ? ' is-dragging' : ''}`}
      data-testid={testId}
      onClick={onInsert}
      onMouseDown={onMouseDown}
    >
      <Text type="secondary" className="standup-history-block-meta">
        {payload.sourceDate} · 段落 {payload.blockIndex + 1}
      </Text>
      <Text className="standup-history-block-text">{payload.blockText}</Text>
    </button>
  );
};

export const StandupPage: React.FC = () => {
  const {
    currentDocument,
    documents,
    loading,
    fetchDocument,
    saveDocument,
    deleteDocument,
    listDocuments,
  } = useStandupStore();

  const [todayDate] = useState<string>(() => dayjs().format(DATE_FORMAT));
  const [editorContent, setEditorContent] = useState('');
  const [editorPreviewMode, setEditorPreviewMode] = useState<PreviewType>('edit');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>();
  const [insertHint, setInsertHint] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [importingTodos, setImportingTodos] = useState(false);
  const [editorDropActive, setEditorDropActive] = useState(false);
  const [historyDockCollapsed, setHistoryDockCollapsed] = useState(false);
  const [activeDragPayload, setActiveDragPayload] = useState<StandupHistoryReferencePayload | null>(null);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const caretRef = useRef<CaretRange | null>(null);

  // --- Pointer-event drag state (replaces HTML5 drag API for Tauri compat) ---
  /** Tracks whether the current mousedown has crossed the drag threshold. */
  const pointerDragActiveRef = useRef(false);
  /** Ghost overlay element rendered during drag. */
  const ghostRef = useRef<HTMLDivElement | null>(null);
  /** mousedown origin for threshold detection. */
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  /** Suppress the click event that fires after mouseup when a drag occurred. */
  const suppressClickRef = useRef(false);

  const historyStartDate = useMemo(
    () => dayjs(todayDate).subtract(HISTORY_RANGE_DAYS, 'day').format(DATE_FORMAT),
    [todayDate],
  );

  useEffect(() => {
    void fetchDocument(todayDate);
  }, [fetchDocument, todayDate]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        await listDocuments(historyStartDate, todayDate);
      } catch (error) {
        message.error(`加载历史记录失败: ${String(error)}`);
      }
    };
    void loadHistory();
  }, [historyStartDate, listDocuments, todayDate]);

  useEffect(() => {
    setEditorContent(currentDocument?.content || '');
    caretRef.current = null;
    setInsertHint(null);
  }, [currentDocument?.content]);

  const historyDocuments = useMemo(() => {
    const uniqueByDate = new Map<string, StandupDocument>();
    documents.forEach((document) => {
      if (document.date === todayDate) return;
      if (!document.content.trim()) return;
      if (!uniqueByDate.has(document.date)) {
        uniqueByDate.set(document.date, document);
      }
    });

    return Array.from(uniqueByDate.values()).sort(
      (left, right) => dayjs(right.date).valueOf() - dayjs(left.date).valueOf(),
    );
  }, [documents, todayDate]);

  useEffect(() => {
    if (historyDocuments.length === 0) {
      setSelectedHistoryDate(undefined);
      return;
    }

    const exists = historyDocuments.some((document) => document.date === selectedHistoryDate);
    if (!exists) {
      setSelectedHistoryDate(historyDocuments[0].date);
    }
  }, [historyDocuments, selectedHistoryDate]);

  const selectedHistoryDocument = useMemo(
    () => historyDocuments.find((document) => document.date === selectedHistoryDate),
    [historyDocuments, selectedHistoryDate],
  );

  const historyBlocks = useMemo(
    () => splitMarkdownParagraphs(selectedHistoryDocument?.content || ''),
    [selectedHistoryDocument?.content],
  );

  const selectedHistoryIndex = useMemo(
    () => historyDocuments.findIndex((document) => document.date === selectedHistoryDate),
    [historyDocuments, selectedHistoryDate],
  );

  // All history dates are shown in a horizontal tag strip — no windowing needed.

  const getNativeTextarea = useCallback((): HTMLTextAreaElement | null => {
    return editorContainerRef.current?.querySelector('textarea') ?? null;
  }, []);

  const rememberCaret = useCallback((target: HTMLTextAreaElement | null) => {
    if (!target) return;
    const { selectionStart, selectionEnd } = target;
    if (Number.isFinite(selectionStart) && Number.isFinite(selectionEnd)) {
      caretRef.current = {
        start: selectionStart,
        end: selectionEnd,
      };
    }
  }, []);

  const insertBlockToEditor = useCallback((rawBlock: string) => {
    const textarea = getNativeTextarea();
    const directStart = textarea?.selectionStart;
    const directEnd = textarea?.selectionEnd;
    const hasDirectCaret = Number.isFinite(directStart) && Number.isFinite(directEnd);
    const caret = hasDirectCaret
      ? { start: Number(directStart), end: Number(directEnd) }
      : caretRef.current;

    const result = insertMarkdownBlock(editorContent, rawBlock, caret);
    if (result.mode === 'noop') {
      return;
    }

    // Use flushSync to force React to synchronously update the DOM,
    // ensuring MDEditor receives and renders the new value immediately
    // rather than batching the update (which can cause the editor's
    // internal state to diverge from the React state during drag events).
    flushSync(() => {
      setEditorContent(result.nextContent);
    });

    if (result.mode === 'append') {
      setInsertHint({ type: 'warning', text: '未检测到光标位置，已追加到文末。' });
      message.warning('未检测到光标位置，已追加到文末。');
    } else {
      setInsertHint({ type: 'success', text: '已按当前光标位置插入内容。' });
      message.success('内容已插入当前光标位置');
    }

    requestAnimationFrame(() => {
      const node = getNativeTextarea();
      if (!node) return;

      // Double-check: if MDEditor's textarea still shows stale content,
      // force-sync it by setting the native value directly and dispatching
      // an input event so MDEditor's internal state picks up the change.
      if (node.value !== result.nextContent) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype, 'value',
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(node, result.nextContent);
          node.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      if (result.nextCaret !== null) {
        node.focus();
        node.selectionStart = result.nextCaret;
        node.selectionEnd = result.nextCaret;
        rememberCaret(node);
      }
    });
  }, [editorContent, getNativeTextarea, rememberCaret]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveDocument({
        date: todayDate,
        content: editorContent,
      });
      await listDocuments(historyStartDate, todayDate);
      message.success('今日早会记录已保存');
    } catch (error) {
      message.error(`保存失败: ${String(error)}`);
    } finally {
      setSaving(false);
    }
  }, [editorContent, historyStartDate, listDocuments, saveDocument, todayDate]);

  const handleDelete = useCallback(async () => {
    if (!currentDocument) return;
    try {
      await deleteDocument(currentDocument.id);
      await listDocuments(historyStartDate, todayDate);
      setEditorContent('');
      setInsertHint(null);
      message.success('今日早会记录已删除');
    } catch (error) {
      message.error(`删除失败: ${String(error)}`);
    }
  }, [currentDocument, deleteDocument, historyStartDate, listDocuments, todayDate]);

  const selectHistoryByIndex = useCallback((index: number) => {
    if (historyDocuments.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(index, historyDocuments.length - 1));
    setSelectedHistoryDate(historyDocuments[boundedIndex].date);
  }, [historyDocuments]);

  // Wheel/keyboard handlers for date switching are now inline in the tag strip JSX.

  const handleImportTodayTodos = useCallback(async () => {
    setImportingTodos(true);
    try {
      const tasks = await taskApi.list({});
      const todayTasks = selectTasksForStandupDate(tasks, todayDate);
      if (todayTasks.length === 0) {
        message.info('当前日期暂无可导入待办');
        return;
      }

      const todoMarkdown = buildTodoImportMarkdown(todayTasks, todayDate);
      if (!caretRef.current) {
        caretRef.current = {
          start: editorContent.length,
          end: editorContent.length,
        };
      }
      insertBlockToEditor(todoMarkdown);
      message.success(`已导入 ${todayTasks.length} 条今日待办`);
    } catch (error) {
      message.error(`导入待办失败: ${String(error)}`);
    } finally {
      setImportingTodos(false);
    }
  }, [editorContent.length, insertBlockToEditor, todayDate]);

  const handleHistoryBlockMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>, payload: StandupHistoryReferencePayload) => {
    // Only left button; ignore if modifier keys held (for text selection / right-click).
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const startX = event.clientX;
    const startY = event.clientY;
    pointerOriginRef.current = { x: startX, y: startY };
    pointerDragActiveRef.current = false;
    suppressClickRef.current = false;

    // ---- helpers ----
    const createGhost = (x: number, y: number) => {
      const ghost = document.createElement('div');
      ghost.className = 'standup-pointer-drag-ghost';
      ghost.textContent = payload.blockText.slice(0, 60) + (payload.blockText.length > 60 ? '…' : '');
      ghost.style.left = `${x + 12}px`;
      ghost.style.top = `${y + 12}px`;
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
    };

    const moveGhost = (x: number, y: number) => {
      if (ghostRef.current) {
        ghostRef.current.style.left = `${x + 12}px`;
        ghostRef.current.style.top = `${y + 12}px`;
      }
    };

    const removeGhost = () => {
      if (ghostRef.current) {
        ghostRef.current.remove();
        ghostRef.current = null;
      }
    };

    const isOverEditor = (x: number, y: number): boolean => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('[data-testid="standup-markdown-editor"]');
    };

    // ---- mousemove (global) ----
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!pointerDragActiveRef.current) {
        // Check threshold before starting drag.
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        // Crossed threshold → start drag.
        pointerDragActiveRef.current = true;
        suppressClickRef.current = true;
        setActiveDragPayload(payload);
        setEditorDropActive(false);
        document.body.classList.add('standup-pointer-dragging');
        createGhost(moveEvent.clientX, moveEvent.clientY);
      }

      moveGhost(moveEvent.clientX, moveEvent.clientY);

      // Hit-test: is the cursor over the editor area?
      const over = isOverEditor(moveEvent.clientX, moveEvent.clientY);
      setEditorDropActive(over);
    };

    // ---- mouseup (global) ----
    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('standup-pointer-dragging');
      removeGhost();

      const wasDragging = pointerDragActiveRef.current;
      pointerDragActiveRef.current = false;
      pointerOriginRef.current = null;

      if (!wasDragging) {
        // Never crossed threshold → let the click handler fire normally.
        setActiveDragPayload(null);
        return;
      }

      // Was dragging — check if released over editor.
      const droppedOnEditor = isOverEditor(upEvent.clientX, upEvent.clientY);
      if (droppedOnEditor) {
        const rawBlock = payload.blockText;
        insertBlockToEditor(buildHistoryReferenceMarkdown(payload, rawBlock));
      }

      setEditorDropActive(false);
      setActiveDragPayload(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [insertBlockToEditor]);

  /** Suppress click events that fire after a pointer-drag mouseup. */
  const handleHistoryBlockClick = useCallback((clickInsert: () => void) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    clickInsert();
  }, []);

  return (
      <div className="standup-page" data-testid="standup-page">
        <div className="standup-page-header standup-page-header-compact">
          <div className="standup-page-title-compact">
            <Title level={4} style={{ margin: 0 }}>今日早会</Title>
            <Text type="secondary" className="standup-page-date-meta">
              单文档记录 · {todayDate}
            </Text>
          </div>

          <Space className="standup-page-actions" size={10}>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={() => void handleSave()}
              data-testid="standup-save-btn"
            >
              保存今日记录
            </Button>
            {currentDocument && (
              <Popconfirm
                title="确定删除今日早会记录？"
                onConfirm={() => void handleDelete()}
                okText="确定"
                cancelText="取消"
              >
                <Button danger icon={<DeleteOutlined />} data-testid="standup-delete-btn">删除</Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        <Spin spinning={loading && !saving && !importingTodos}>
          <div className={`standup-workspace-grid${historyDockCollapsed ? ' is-history-collapsed' : ''}`}>
            <Card
              title={(
                <div className="standup-panel-title-wrap is-compact">
                  <div className="standup-panel-title-row">
                    <span className="standup-panel-title">今日记录</span>
                    <span className="standup-panel-microcopy">主编辑区</span>
                  </div>
                </div>
              )}
              className="standup-editor-card"
              extra={(
                <Space wrap>
                  <div data-testid="standup-preview-mode">
                    <Segmented<PreviewType>
                      value={editorPreviewMode}
                      onChange={(value) => setEditorPreviewMode(value as PreviewType)}
                      options={[
                        { label: '仅编辑', value: 'edit' },
                        { label: '编辑+预览', value: 'live' },
                        { label: '仅预览', value: 'preview' },
                      ]}
                    />
                  </div>
                  <Button
                    icon={<SyncOutlined />}
                    loading={importingTodos}
                    onClick={() => void handleImportTodayTodos()}
                    data-testid="standup-import-today-todos-btn"
                  >
                    导入今日待办
                  </Button>
                </Space>
              )}
            >
              <Text type="secondary" className="standup-editor-summary">
                在这里完成今天的记录；历史片段和待办只作为辅助输入，不打断你的主编辑节奏。
              </Text>

              <StandupMarkdownEditor
                value={editorContent}
                onChange={setEditorContent}
                editorContainerRef={editorContainerRef}
                preview={editorPreviewMode}
                height={620}
                dropActive={editorDropActive}
                onClick={(event) => rememberCaret(event.currentTarget)}
                onSelect={(event) => rememberCaret(event.currentTarget as HTMLTextAreaElement)}
                onKeyUp={(event) => rememberCaret(event.currentTarget)}
                onFocus={(event) => rememberCaret(event.currentTarget)}
              />

              {insertHint && (
                <Text
                  type={insertHint.type === 'warning' ? 'warning' : 'success'}
                  className="standup-insert-hint"
                  data-testid="standup-insert-hint"
                >
                  {insertHint.text}
                </Text>
              )}
            </Card>

            <Card
              title={(
                <div className="standup-panel-title-wrap is-compact">
                  <div className="standup-panel-title-row">
                    <span className="standup-panel-title">历史复用</span>
                    <span className="standup-panel-microcopy">按需展开</span>
                  </div>
                </div>
              )}
              className="standup-history-card"
              data-testid="standup-history-panel"
              extra={(
                <Button
                  type="text"
                  size="small"
                  className="standup-history-toggle-btn"
                  data-testid="standup-history-toggle-btn"
                  onClick={() => setHistoryDockCollapsed((collapsed) => !collapsed)}
                >
                  {historyDockCollapsed ? '展开历史' : '收起历史'}
                </Button>
              )}
            >
              {historyDockCollapsed ? (
                <div className="standup-history-collapsed" data-testid="standup-history-collapsed">
                  <Text className="standup-history-collapsed-count">{historyDocuments.length}</Text>
                  <Text type="secondary" className="standup-history-collapsed-label">条历史记录</Text>
                  <Text type="secondary" className="standup-history-collapsed-meta">
                    需要时展开，避免占用正文空间。
                  </Text>
                </div>
              ) : historyDocuments.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无历史记录可拖拽"
                  data-testid="standup-history-empty"
                />
              ) : (
                <div className="standup-history-layout">
                  {/* ── Horizontal date tag strip ── */}
                  <div
                    className="standup-history-date-strip"
                    role="listbox"
                    tabIndex={0}
                    aria-label="历史早会日期选择"
                    data-testid="standup-history-wheel"
                    onKeyDown={(event) => {
                      if (historyDocuments.length <= 1) return;
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight'
                        && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      const baseIndex = selectedHistoryIndex >= 0 ? selectedHistoryIndex : 0;
                      const direction = (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1;
                      selectHistoryByIndex(baseIndex + direction);
                    }}
                  >
                    {historyDocuments.map((document, index) => {
                      const active = document.date === selectedHistoryDate;
                      return (
                        <button
                          key={document.date}
                          type="button"
                          onClick={() => setSelectedHistoryDate(document.date)}
                          className={`standup-history-date-tag${active ? ' is-active' : ''}`}
                          data-testid={active ? 'standup-history-wheel-current' : `standup-history-wheel-item-${index}`}
                        >
                          {document.date}
                        </button>
                      );
                    })}
                  </div>

                  <Text type="secondary" className="standup-history-strip-count">
                    共 {historyDocuments.length} 条历史记录
                  </Text>

                  {/* ── Paragraph blocks ── */}
                  <Text type="secondary" className="standup-history-summary">
                    当前查看 {selectedHistoryDocument?.date ?? '未选择'}，可拖拽 {historyBlocks.length} 个段落，也可点击直接插入。
                  </Text>

                  {historyBlocks.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="该日期内容为空，暂无可拖拽段落"
                      data-testid="standup-history-date-empty"
                    />
                  ) : (
                    <div className="standup-history-blocks">
                      {historyBlocks.map((block, index) => {
                        const payload = {
                          sourceDate: selectedHistoryDocument?.date ?? todayDate,
                          blockIndex: index,
                          blockText: block,
                        } satisfies StandupHistoryReferencePayload;

                        return (
                          <StandupHistoryBlock
                            key={`${payload.sourceDate}_${payload.blockIndex}_${payload.blockText}`}
                            payload={payload}
                            testId={`standup-history-block-${index}`}
                            onInsert={() => handleHistoryBlockClick(() => insertBlockToEditor(buildHistoryReferenceMarkdown(payload, block)))}
                            onMouseDown={(event) => handleHistoryBlockMouseDown(event, payload)}
                            isDragging={activeDragPayload?.sourceDate === payload.sourceDate && activeDragPayload?.blockIndex === payload.blockIndex}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>
        </Spin>
      </div>
  );
};
