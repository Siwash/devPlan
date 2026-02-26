import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Select, DatePicker, InputNumber } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

export interface EditableCellProps {
  value: any;
  columnType: 'text' | 'select' | 'date' | 'number';
  options?: { label: string; value: any }[];
  onChange: (newValue: any) => void;
  editable?: boolean;
  /** Custom render for display mode. If not provided, raw value is shown. */
  displayRender?: (value: any) => React.ReactNode;
  /** Show fill handle (blue square) on hover */
  showFillHandle?: boolean;
  /** Called when user starts dragging the fill handle */
  onFillHandleMouseDown?: (e: React.MouseEvent) => void;
}

/**
 * A generic inline-editable cell component.
 *
 * - Click to enter edit mode.
 * - Blur / Enter commits the value via `onChange`.
 * - Escape cancels and reverts to the original value.
 */
export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  columnType,
  options,
  onChange,
  editable = true,
  displayRender,
  showFillHandle = false,
  onFillHandleMouseDown,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value);
  const inputRef = useRef<any>(null);
  const fillDraggingRef = useRef(false);

  // Keep draft in sync when external value changes while not editing
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  // Auto-focus the editor when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      // Input / InputNumber expose focus()
      if (typeof inputRef.current.focus === 'function') {
        inputRef.current.focus();
      }
    }
  }, [editing]);

  const commit = useCallback(
    (newValue: any) => {
      setEditing(false);
      if (newValue !== value) {
        onChange(newValue);
      }
    },
    [onChange, value],
  );

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit(draft);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel, draft],
  );

  // ---- Display mode ----
  if (!editable || !editing) {
    const displayValue = displayRender ? displayRender(value) : formatDisplayValue(value, columnType, options);
    return (
      <div
        className="editable-cell-wrapper"
        style={{
          cursor: editable ? 'pointer' : 'default',
          minHeight: 22,
          padding: '1px 0',
          width: '100%',
          position: 'relative',
        }}
        onClick={() => {
          // Don't enter edit mode if a fill drag just happened
          if (fillDraggingRef.current) {
            fillDraggingRef.current = false;
            return;
          }
          if (editable) setEditing(true);
        }}
      >
        {displayValue ?? <span style={{ color: '#bfbfbf' }}>-</span>}
        {showFillHandle && onFillHandleMouseDown && (
          <div
            className="fill-handle"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              fillDraggingRef.current = true;
              onFillHandleMouseDown(e);
              // Reset flag after mouseup so click is blocked
              const reset = () => {
                // Small delay so the click event fires first and sees the flag
                setTimeout(() => { fillDraggingRef.current = false; }, 100);
                document.removeEventListener('mouseup', reset);
              };
              document.addEventListener('mouseup', reset);
            }}
          />
        )}
      </div>
    );
  }

  // ---- Edit mode ----
  switch (columnType) {
    case 'select':
      return (
        <Select
          ref={inputRef}
          size="small"
          value={draft}
          options={options}
          style={{ width: '100%' }}
          autoFocus
          open
          allowClear
          onChange={(v) => {
            setDraft(v);
            // Commit immediately on select change
            commit(v);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={handleKeyDown}
        />
      );

    case 'date':
      return (
        <DatePicker
          ref={inputRef}
          size="small"
          value={draft ? dayjs(draft) : null}
          style={{ width: '100%' }}
          autoFocus
          open
          onChange={(date: Dayjs | null) => {
            const formatted = date ? date.format('YYYY-MM-DD') : undefined;
            setDraft(formatted);
            commit(formatted);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={handleKeyDown}
        />
      );

    case 'number':
      return (
        <InputNumber
          ref={inputRef}
          size="small"
          value={draft}
          style={{ width: '100%' }}
          min={0}
          onChange={(v) => setDraft(v)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKeyDown}
        />
      );

    case 'text':
    default:
      return (
        <Input
          ref={inputRef}
          size="small"
          value={draft ?? ''}
          style={{ width: '100%' }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKeyDown}
        />
      );
  }
};

/** Produce a human-readable display string for a cell value. */
function formatDisplayValue(
  value: any,
  columnType: string,
  options?: { label: string; value: any }[],
): React.ReactNode {
  if (value == null || value === '') return null;

  if (columnType === 'select' && options) {
    const match = options.find((o) => o.value === value);
    return match ? match.label : String(value);
  }

  return String(value);
}
