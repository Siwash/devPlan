import { expect, test, type Page } from '@playwright/test';

interface MockStandupDocument {
  id: number;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface TauriMockOptions {
  failSaveStandup?: boolean;
}

const todayDate = (): string => new Date().toISOString().slice(0, 10);

const offsetDate = (offsetDays: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const installTauriMock = async (
  page: Page,
  seedDocs: MockStandupDocument[] = [],
  options: TauriMockOptions = {},
): Promise<void> => {
  await page.addInitScript(({ docs, mockOptions }) => {
    const STORAGE_KEY = '__pw_standup_docs__';
    const NEXT_ID_KEY = '__pw_standup_next_id__';
    let memoryDocs = [...docs];
    let memoryNextId = docs.reduce((acc, doc) => Math.max(acc, Number(doc?.id ?? 0)), 0) + 1;

    const readSession = (key: string): string | null => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const writeSession = (key: string, value: string): void => {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // ignored for non-origin contexts like about:blank
      }
    };

    const parseDocs = (raw: string | null) => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };

    const nowIso = (): string => new Date().toISOString();

    const writeDocs = (nextDocs: unknown[]) => {
      memoryDocs = parseDocs(JSON.stringify(nextDocs));
      writeSession(STORAGE_KEY, JSON.stringify(nextDocs));
    };

    const readDocs = () => {
      const raw = readSession(STORAGE_KEY);
      if (raw === null) return memoryDocs;
      return parseDocs(raw);
    };

    const readNextId = (): number => {
      const raw = readSession(NEXT_ID_KEY);
      if (raw === null) return memoryNextId;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : memoryNextId;
    };

    const writeNextId = (nextId: number): void => {
      memoryNextId = nextId;
      writeSession(NEXT_ID_KEY, String(nextId));
    };

    const ensureSeeded = () => {
      const existing = readSession(STORAGE_KEY);
      if (existing !== null) return;
      writeDocs(docs);
      writeNextId(memoryNextId);
    };

    ensureSeeded();

    let callbackId = 1;

    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        if (cmd === 'get_setting') return null;
        if (cmd === 'save_setting') return null;

        if (cmd === 'get_standup_by_date') {
          const docsList = readDocs();
          const date = String(args.date ?? '');
          return docsList.find((doc) => doc.date === date) ?? null;
        }

        if (cmd === 'list_standups') {
          const docsList = readDocs();
          const startDate = String(args.startDate ?? '');
          const endDate = String(args.endDate ?? '');
          return docsList
            .filter((doc) => doc.date >= startDate && doc.date <= endDate)
            .sort((a, b) => b.date.localeCompare(a.date));
        }

        if (cmd === 'save_standup') {
          if (mockOptions.failSaveStandup) {
            throw new Error('mock save_standup failure');
          }

          const request = (args.request ?? {}) as { date?: string; content?: string };
          const date = String(request.date ?? '');
          const content = String(request.content ?? '');
          const docsList = readDocs();
          const existing = docsList.find((doc) => doc.date === date);

          if (existing) {
            existing.content = content;
            existing.updated_at = nowIso();
            writeDocs(docsList);
            return existing.id;
          }

          const nextId = readNextId();
          const nextDoc = {
            id: nextId,
            date,
            content,
            created_at: nowIso(),
            updated_at: nowIso(),
          };
          docsList.push(nextDoc);
          writeDocs(docsList);
          writeNextId(nextId + 1);
          return nextId;
        }

        if (cmd === 'delete_standup') {
          const id = Number(args.id);
          const docsList = readDocs();
          const nextDocs = docsList.filter((doc) => doc.id !== id);
          writeDocs(nextDocs);
          return null;
        }

        if (cmd.startsWith('list_')) return [];
        if (cmd.startsWith('get_')) return null;
        if (cmd.startsWith('count_')) return 0;
        if (cmd.startsWith('create_')) return 1;
        if (cmd.startsWith('save_')) return 1;
        if (cmd.startsWith('update_')) return null;
        if (cmd.startsWith('delete_')) return null;
        if (cmd.startsWith('batch_')) return { success_count: 0, failed_ids: [] };
        return [];
      },
      transformCallback: () => {
        callbackId += 1;
        return callbackId;
      },
      unregisterCallback: () => {},
      convertFileSrc: (filePath: string) => `asset://${filePath}`,
    };

    (globalThis as { isTauri?: boolean }).isTauri = true;
  }, { docs: seedDocs, mockOptions: options });
};

const openStandupPage = async (
  page: Page,
  seedDocs: MockStandupDocument[] = [],
  options: TauriMockOptions = {},
): Promise<void> => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await installTauriMock(page, seedDocs, options);
  await page.goto('/#/todo');
  await page.getByRole('menuitem', { name: '早会记录' }).click();
  await page.waitForLoadState('domcontentloaded');
  const standupPage = page.getByTestId('standup-page');
  try {
    await expect(standupPage).toBeVisible({ timeout: 10_000 });
  } catch {
    const bodyText = await page.locator('body').innerText();
    const currentUrl = page.url();
    const title = await page.title();
    throw new Error(
      `Standup page did not render. url=${currentUrl}; title=${title}; `
      + `pageErrors=${JSON.stringify(pageErrors)}; consoleErrors=${JSON.stringify(consoleErrors)}; `
      + `body=${bodyText.slice(0, 800)}`,
    );
  }
};

test('save and reload keeps today markdown content', async ({ page }) => {
  await openStandupPage(page);

  const editor = page.getByTestId('standup-today-editor');
  const markdown = '## 今日进展\n- 完成 Playwright 基建';

  await editor.fill(markdown);
  await page.getByTestId('standup-save-btn').click();
  await expect(page.getByText('今日早会记录已保存')).toBeVisible();

  await page.reload();
  await expect(editor).toHaveValue(markdown);
});

test('save failure shows unified message and keeps editor content', async ({ page }) => {
  await openStandupPage(page, [], { failSaveStandup: true });

  const editor = page.getByTestId('standup-today-editor');
  const markdown = '## 保存失败场景\n- 不应丢失编辑内容';

  await editor.fill(markdown);
  await page.getByTestId('standup-save-btn').click();

  await expect(page.getByText(/^保存失败:/)).toBeVisible();
  await expect(editor).toHaveValue(markdown);
});

test('history load supports switching selected date', async ({ page }) => {
  const newerDate = offsetDate(-1);
  const olderDate = offsetDate(-3);

  await openStandupPage(page, [
    {
      id: 11,
      date: newerDate,
      content: '昨天段落 A\n\n昨天段落 B',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 12,
      date: olderDate,
      content: '更早历史段落',
      created_at: '2026-02-27T00:00:00.000Z',
      updated_at: '2026-02-27T00:00:00.000Z',
    },
  ]);

  await expect(page.getByTestId('standup-history-block-0')).toContainText('昨天段落 A');

  await page.getByTestId('standup-history-panel').getByRole('combobox').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('standup-history-block-0')).toContainText('更早历史段落');
});

test('drag-copy intent inserts at caret and keeps history block unchanged', async ({ page }) => {
  await openStandupPage(page, [
    {
      id: 21,
      date: offsetDate(-1),
      content: '历史段落 Alpha\n\n历史段落 Beta',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    },
  ]);

  const editor = page.getByTestId('standup-today-editor');
  const initial = 'before [slot] after';

  await editor.fill(initial);
  await editor.evaluate((node) => {
    const textarea = node as HTMLTextAreaElement;
    const marker = '[slot]';
    const start = textarea.value.indexOf(marker);
    textarea.focus();
    textarea.setSelectionRange(start, start + marker.length);
  });

  const sourceBlock = page.getByTestId('standup-history-block-0');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await dataTransfer.evaluate((dt) => {
    dt.setData('application/x-standup-markdown-block', '历史段落 Alpha');
    dt.setData('text/plain', '历史段落 Alpha');
  });
  await sourceBlock.dispatchEvent('dragstart', { dataTransfer });
  await editor.dispatchEvent('drop', { dataTransfer });

  await expect(page.getByTestId('standup-insert-hint')).toContainText('已按当前光标位置插入段落');
  await expect(editor).toHaveValue('before 历史段落 Alpha after');
  await expect(page.getByTestId('standup-history-block-0')).toContainText('历史段落 Alpha');
});

test('drop falls back to append when caret position is unavailable', async ({ page }) => {
  await openStandupPage(page, [
    {
      id: 22,
      date: offsetDate(-1),
      content: '历史段落 Fallback',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    },
  ]);

  const editor = page.getByTestId('standup-today-editor');
  const baseText = '今日基础内容';

  await editor.fill(baseText);
  await page.getByTestId('standup-save-btn').click();
  await expect(page.getByText('今日早会记录已保存')).toBeVisible();

  await page.reload();

  const reloadedEditor = page.getByTestId('standup-today-editor');
  await expect(reloadedEditor).toHaveValue(baseText);
  await reloadedEditor.evaluate((node) => {
    const textarea = node as HTMLTextAreaElement;
    textarea.blur();
    Object.defineProperty(textarea, 'selectionStart', {
      configurable: true,
      get: () => Number.NaN,
      set: () => {},
    });
    Object.defineProperty(textarea, 'selectionEnd', {
      configurable: true,
      get: () => Number.NaN,
      set: () => {},
    });
  });

  const sourceBlock = page.getByTestId('standup-history-block-0');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await dataTransfer.evaluate((dt) => {
    dt.setData('application/x-standup-markdown-block', '历史段落 Fallback');
    dt.setData('text/plain', '历史段落 Fallback');
  });
  await sourceBlock.dispatchEvent('dragstart', { dataTransfer });
  await reloadedEditor.dispatchEvent('drop', { dataTransfer });

  await expect(page.getByTestId('standup-insert-hint')).toContainText('未检测到光标位置，已追加到文末。');
  await expect(reloadedEditor).toHaveValue(`${baseText}\n\n历史段落 Fallback`);
});

test('preview toggle shows and hides markdown preview panel', async ({ page }) => {
  await openStandupPage(page);

  await page.getByTestId('standup-today-editor').fill('# Standup 标题');
  await page.getByTestId('standup-preview-toggle').click();

  await expect(page.getByTestId('standup-markdown-preview')).toBeVisible();
  await expect(page.getByTestId('standup-markdown-preview').getByRole('heading', { level: 1 })).toHaveText('Standup 标题');

  await page.getByTestId('standup-preview-toggle').click();
  await expect(page.getByTestId('standup-markdown-preview')).toBeHidden();
});

test('empty-history state is rendered when no historical document exists', async ({ page }) => {
  await openStandupPage(page, [
    {
      id: 31,
      date: todayDate(),
      content: '仅今日内容，不算历史',
      created_at: '2026-03-06T00:00:00.000Z',
      updated_at: '2026-03-06T00:00:00.000Z',
    },
  ]);

  await expect(page.getByTestId('standup-history-empty')).toBeVisible();
  await expect(page.getByTestId('standup-history-empty')).toContainText('暂无历史记录可拖拽');
});
