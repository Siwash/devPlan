import React from 'react';
import { Input } from 'antd';
import MDEditor from '@uiw/react-md-editor';
import { getCommands, getExtraCommands } from '@uiw/react-md-editor/commands-cn';
import type { PreviewType } from '@uiw/react-md-editor';
import remarkGfm from 'remark-gfm';

import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

const { TextArea } = Input;

interface NativeTextareaHandlers {
  onClick: React.MouseEventHandler<HTMLTextAreaElement>;
  onSelect: React.ReactEventHandler<HTMLTextAreaElement>;
  onKeyUp: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onFocus: React.FocusEventHandler<HTMLTextAreaElement>;
}

interface StandupMarkdownEditorProps extends NativeTextareaHandlers {
  value: string;
  onChange: (value: string) => void;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  preview: PreviewType;
  height?: number;
  dropActive?: boolean;
}

interface EditorBoundaryProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

interface EditorBoundaryState {
  hasError: boolean;
}

class EditorBoundary extends React.Component<EditorBoundaryProps, EditorBoundaryState> {
  public constructor(props: EditorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): EditorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: unknown): void {
    console.error('standup markdown editor crashed, fallback to textarea', error);
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const StandupMarkdownEditor: React.FC<StandupMarkdownEditorProps> = ({
  value,
  onChange,
  editorContainerRef,
  preview,
  height = 560,
  dropActive = false,
  onClick,
  onSelect,
  onKeyUp,
  onFocus,
}) => {
  const enabledCommandNames = React.useMemo(
    () => new Set(['title', 'bold', 'italic', 'link', 'quote', 'codeBlock', 'unordered-list', 'ordered-list', 'checked-list']),
    [],
  );

  const commands = React.useMemo(
    () => getCommands().filter((command) => enabledCommandNames.has(command.name ?? '')),
    [enabledCommandNames],
  );
  const extraCommands = React.useMemo(() => getExtraCommands().filter(() => false), []);

  const textareaProps = React.useMemo(() => ({
    placeholder: '请输入今日 Standup Markdown 内容，可拖拽历史记录或导入今日待办...',
    'data-testid': 'standup-today-editor',
    style: {
      minHeight: Math.max(480, height - 120),
    },
    onClick,
    onSelect,
    onKeyUp,
    onFocus,
  }), [height, onClick, onFocus, onKeyUp, onSelect]);

  const setCombinedEditorRef = React.useCallback((node: HTMLDivElement | null) => {
    editorContainerRef.current = node;
  }, [editorContainerRef]);

  const fallbackEditor = (
    <div ref={setCombinedEditorRef}>
      <TextArea
        rows={20}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid="standup-today-editor"
        placeholder="请输入今日 Standup Markdown 内容，可拖拽历史记录或导入今日待办..."
        onClick={onClick}
        onSelect={onSelect}
        onKeyUp={onKeyUp}
        onFocus={onFocus}
      />
    </div>
  );

  return (
    <EditorBoundary fallback={fallbackEditor}>
      <div
        ref={setCombinedEditorRef}
        data-color-mode="light"
        data-testid="standup-markdown-editor"
        className={`standup-markdown-editor-shell${dropActive ? ' is-drop-active' : ''}`}
      >
        {dropActive && (
          <div className="standup-editor-drop-overlay" data-testid="standup-editor-drop-overlay">
            释放鼠标即可插入历史内容
          </div>
        )}
        <div>
          <MDEditor
            value={value}
            onChange={(nextValue) => onChange(nextValue ?? '')}
            preview={preview}
            height={height}
            visibleDragbar={false}
            commands={commands}
            extraCommands={extraCommands}
            textareaProps={textareaProps}
            previewOptions={{
              remarkPlugins: [remarkGfm],
            }}
          />
        </div>
      </div>
    </EditorBoundary>
  );
};
