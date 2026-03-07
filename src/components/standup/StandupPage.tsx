import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Divider,
  Empty,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextAreaRef } from 'antd/es/input/TextArea';

import { useStandupStore } from '../../stores/standupStore';
import type { StandupDocument } from '../../lib/types';
import { insertMarkdownBlock, splitMarkdownParagraphs } from './standupMarkdownUtils';

const { TextArea } = Input;
const { Title, Text } = Typography;

const DATE_FORMAT = 'YYYY-MM-DD';
const HISTORY_RANGE_DAYS = 180;

interface CaretRange {
  start: number;
  end: number;
}

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
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>();
  const [insertHint, setInsertHint] = useState<{ type: 'success' | 'warning'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<TextAreaRef>(null);
  const caretRef = useRef<CaretRange | null>(null);

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
      } catch (e) {
        message.error(`加载历史记录失败: ${String(e)}`);
      }
    };
    void loadHistory();
  }, [historyStartDate, listDocuments, todayDate]);

  useEffect(() => {
    setEditorContent(currentDocument?.content || '');
    caretRef.current = null;
    setInsertHint(null);
  }, [currentDocument?.content, currentDocument?.id]);

  const historyDocuments = useMemo(() => {
    const uniqueByDate = new Map<string, StandupDocument>();
    documents.forEach((doc) => {
      if (doc.date === todayDate) return;
      if (!doc.content.trim()) return;
      if (!uniqueByDate.has(doc.date)) {
        uniqueByDate.set(doc.date, doc);
      }
    });
    return Array.from(uniqueByDate.values()).sort(
      (a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf(),
    );
  }, [documents, todayDate]);

  useEffect(() => {
    if (historyDocuments.length === 0) {
      setSelectedHistoryDate(undefined);
      return;
    }
    const exists = historyDocuments.some((doc) => doc.date === selectedHistoryDate);
    if (!exists) {
      setSelectedHistoryDate(historyDocuments[0].date);
    }
  }, [historyDocuments, selectedHistoryDate]);

  const selectedHistoryDocument = useMemo(
    () => historyDocuments.find((doc) => doc.date === selectedHistoryDate),
    [historyDocuments, selectedHistoryDate],
  );

  const historyBlocks = useMemo(
    () => splitMarkdownParagraphs(selectedHistoryDocument?.content || ''),
    [selectedHistoryDocument?.content],
  );

  const historyDateOptions = useMemo(
    () => historyDocuments.map((doc) => ({ label: doc.date, value: doc.date })),
    [historyDocuments],
  );

  const getNativeTextarea = useCallback((): HTMLTextAreaElement | null => {
    return editorRef.current?.resizableTextArea?.textArea ?? null;
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

    setEditorContent(result.nextContent);

    if (result.mode === 'append') {
      setInsertHint({ type: 'warning', text: '未检测到光标位置，已追加到文末。' });
      message.warning('未检测到光标位置，已追加到文末。');
    } else {
      setInsertHint({ type: 'success', text: '已按当前光标位置插入段落。' });
      message.success('段落已插入当前光标位置');
    }

    requestAnimationFrame(() => {
      const node = getNativeTextarea();
      if (!node || result.nextCaret === null) return;
      node.focus();
      node.selectionStart = result.nextCaret;
      node.selectionEnd = result.nextCaret;
      rememberCaret(node);
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
    } catch (e) {
      message.error(`保存失败: ${String(e)}`);
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
    } catch (e) {
      message.error(`删除失败: ${String(e)}`);
    }
  }, [currentDocument, deleteDocument, historyStartDate, listDocuments, todayDate]);

  const handleEditorDrop = useCallback((event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const block = event.dataTransfer.getData('application/x-standup-markdown-block')
      || event.dataTransfer.getData('text/plain');
    insertBlockToEditor(block);
  }, [insertBlockToEditor]);

  const handleHistoryDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, block: string) => {
    event.dataTransfer.setData('application/x-standup-markdown-block', block);
    event.dataTransfer.setData('text/plain', block);
    event.dataTransfer.effectAllowed = 'copy';
  }, []);

  return (
    <div style={{ height: '100%', overflow: 'auto' }} data-testid="standup-page">
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space size={12} wrap>
          <Title level={4} style={{ margin: 0 }}>集中早会编辑</Title>
          <Tag color="blue" data-testid="standup-today-date-tag">今日 {todayDate}</Tag>
          <Text type="secondary">单文档 Markdown 编辑（支持历史段落拖拽复制）</Text>
        </Space>

        <Space>
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

      <Spin spinning={loading && !saving}>
        <Card
          title="今日 Markdown"
          style={{ marginBottom: 16 }}
          extra={(
            <Space>
              <Text type="secondary">预览</Text>
              <Switch
                checked={previewVisible}
                onChange={setPreviewVisible}
                data-testid="standup-preview-toggle"
              />
            </Space>
          )}
        >
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            可直接输入，或将下方历史段落拖拽到编辑器中。拖拽为复制，历史内容不会改变。
          </Text>

          <TextArea
            ref={editorRef}
            rows={14}
            value={editorContent}
            onChange={(event) => {
              setEditorContent(event.target.value);
              rememberCaret(event.target);
            }}
            onClick={(event) => rememberCaret(event.currentTarget)}
            onSelect={(event) => rememberCaret(event.currentTarget)}
            onKeyUp={(event) => rememberCaret(event.currentTarget)}
            onFocus={(event) => rememberCaret(event.currentTarget)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={handleEditorDrop}
            placeholder="请输入今日 Standup Markdown 内容..."
            data-testid="standup-today-editor"
          />

          {insertHint && (
            <Text
              type={insertHint.type === 'warning' ? 'warning' : 'success'}
              style={{ display: 'block', marginTop: 8 }}
              data-testid="standup-insert-hint"
            >
              {insertHint.text}
            </Text>
          )}

          {previewVisible && (
            <>
              <Divider style={{ margin: '14px 0' }} />
              <div
                className="chat-markdown"
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  background: '#fafafa',
                  padding: 14,
                  minHeight: 120,
                }}
                data-testid="standup-markdown-preview"
              >
                {editorContent.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{editorContent}</ReactMarkdown>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可预览内容" />
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="历史日期段落拖拽复制" data-testid="standup-history-panel">
          {historyDocuments.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无历史记录可拖拽"
              data-testid="standup-history-empty"
            />
          ) : (
            <>
              <div data-testid="standup-history-date-selector" style={{ marginBottom: 12 }}>
                <Select
                  style={{ width: 280, maxWidth: '100%' }}
                  options={historyDateOptions}
                  value={selectedHistoryDate}
                  onChange={setSelectedHistoryDate}
                  placeholder="选择历史日期"
                />
              </div>

              {historyBlocks.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="该日期内容为空，暂无可拖拽段落"
                  data-testid="standup-history-date-empty"
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 12,
                  }}
                >
                  {historyBlocks.map((block, index) => (
                    <div
                      key={`${selectedHistoryDate}_${index}`}
                      draggable
                      onDragStart={(event) => handleHistoryDragStart(event, block)}
                      style={{
                        border: '1px dashed #91caff',
                        background: '#f0f8ff',
                        borderRadius: 8,
                        padding: 12,
                        cursor: 'grab',
                        minHeight: 92,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                      data-testid={`standup-history-block-${index}`}
                    >
                      <Text type="secondary">段落 {index + 1}</Text>
                      <Text style={{ whiteSpace: 'pre-wrap', userSelect: 'none' }}>{block}</Text>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </Spin>
    </div>
  );
};
