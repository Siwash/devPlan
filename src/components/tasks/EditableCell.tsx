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
  /** For date type: disable specific dates in the picker */
  disabledDate?: (current: Dayjs) => boolean;
  /** For date type: custom cell render for the picker panel */
  dateCellRender?: (current: Dayjs, info: { originNode: React.ReactNode }) => React.ReactNode;
  /** Called when the DatePicker panel opens (for lazy loading workload data) */
  onDatePickerOpen?: () => void;
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
  disabledDate,
  dateCellRender,
  onDatePickerOpen,
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
      // Normalize null/undefined to null for consistent comparison
      const normalized = newValue ?? null;
      const originalNormalized = value ?? null;
      if (normalized !== originalNormalized) {
        onChange(normalized);
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
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
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
        <DatePickerCell
          inputRef={inputRef}
          draft={draft}
          disabledDate={disabledDate}
          dateCellRender={dateCellRender}
          onDatePickerOpen={onDatePickerOpen}
          onChange={(formatted) => {
            setDraft(formatted);
            commit(formatted);
          }}
          onCancel={cancel}
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

/** Extracted DatePicker cell — no onBlur, uses onOpenChange to detect panel close */
const DatePickerCell: React.FC<{
  inputRef: React.RefObject<any>;
  draft: any;
  disabledDate?: (current: Dayjs) => boolean;
  dateCellRender?: (current: Dayjs, info: { originNode: React.ReactNode }) => React.ReactNode;
  onDatePickerOpen?: () => void;
  onChange: (formatted: string | undefined) => void;
  onCancel: () => void;
}> = ({ inputRef, draft, disabledDate, dateCellRender, onDatePickerOpen, onChange, onCancel }) => {
  const firedRef = useRef(false);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!firedRef.current && onDatePickerOpen) {
      firedRef.current = true;
      onDatePickerOpen();
    }
  }, []);

  // When panel closes (user clicked outside), cancel editing
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && !committedRef.current) {
      onCancel();
    }
  }, [onCancel]);

  const handleChange = useCallback((date: Dayjs | null) => {
    committedRef.current = true;
    onChange(date ? date.format('YYYY-MM-DD') : undefined);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [onCancel]);

  return (
    <DatePicker
      ref={inputRef}
      size="small"
      value={draft ? dayjs(draft) : null}
      style={{ width: '100%' }}
      autoFocus
      open
      disabledDate={disabledDate}
      cellRender={dateCellRender
        ? (current, info) => {
            if (info.type !== 'date') return info.originNode;
            return dateCellRender(current as Dayjs, { originNode: info.originNode });
          }
        : undefined
      }
      onChange={handleChange}
      onOpenChange={handleOpenChange}
      onKeyDown={handleKeyDown}
    />
  );
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
