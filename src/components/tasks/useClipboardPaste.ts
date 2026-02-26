import { useEffect, useRef, useCallback } from 'react';

export interface UseClipboardPasteOptions {
  /**
   * Ordered list of field names that map to the columns in the pasted data.
   * The first column of each pasted row maps to `columnFields[0]`, etc.
   */
  columnFields: string[];
  /**
   * Called with the parsed rows from the clipboard.
   * Each row is a Record mapping field names to string values.
   */
  onPaste: (rows: Record<string, string>[]) => void;
  /**
   * When true the hook is active. Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Custom hook that listens for `paste` events and parses tab-separated data
 * (e.g. copied from Excel / Google Sheets) into structured rows.
 *
 * Attach the returned `containerRef` to the wrapper element around the table
 * so the paste listener is scoped. If the ref is not attached, the listener
 * falls back to `document`.
 *
 * @example
 * ```tsx
 * const { containerRef } = useClipboardPaste({
 *   columnFields: ['task_type', 'external_id', 'name', 'owner_name'],
 *   onPaste: (rows) => handleBatchCreate(rows),
 * });
 *
 * return <div ref={containerRef}><Table ... /></div>;
 * ```
 */
export function useClipboardPaste(options: UseClipboardPasteOptions) {
  const { columnFields, onPaste, enabled = true } = options;
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep latest callback refs to avoid stale closures
  const onPasteRef = useRef(onPaste);
  onPasteRef.current = onPaste;

  const fieldsRef = useRef(columnFields);
  fieldsRef.current = columnFields;

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Only handle when no input / textarea / contenteditable is focused,
      // so we don't interfere with normal editing.
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          (active as HTMLElement).isContentEditable
        ) {
          return;
        }
      }

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      // Split into rows (handle both \r\n and \n)
      const rawRows = text.split(/\r?\n/).filter((line) => line.trim() !== '');
      if (rawRows.length === 0) return;

      const fields = fieldsRef.current;

      const parsed: Record<string, string>[] = rawRows.map((row) => {
        const cells = row.split('\t');
        const record: Record<string, string> = {};
        fields.forEach((field, idx) => {
          const cellValue = idx < cells.length ? cells[idx].trim() : '';
          record[field] = cellValue;
        });
        return record;
      });

      if (parsed.length > 0) {
        e.preventDefault();
        onPasteRef.current(parsed);
      }
    },
    [], // stable – uses refs internally
  );

  useEffect(() => {
    if (!enabled) return;

    const target = containerRef.current ?? document;
    target.addEventListener('paste', handlePaste as EventListener);

    return () => {
      target.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [enabled, handlePaste]);

  return { containerRef };
}
