import { invoke } from '@tauri-apps/api/core';
import type {
  Task, CreateTaskDto, UpdateTaskDto, TaskFilter,
  Developer, CreateDeveloperDto, UpdateDeveloperDto,
  Sprint, Project, CreateSprintDto,
  CalendarEvent, CalendarResource, DeveloperWorkload,
  ExcelFileInfo, SheetScore, ColumnMatch, ImportResult, ImportHistory,
  LlmConfig, ExcelTemplateConfig, BatchResult,
  ChatMessage, LlmChatResponse, ChatAction, TaskGroup, ScheduleSuggestion,
} from './types';

// Task API
export const taskApi = {
  list: (filter: TaskFilter = {}) => invoke<Task[]>('list_tasks', { filter }),
  get: (id: number) => invoke<Task | null>('get_task', { id }),
  create: (dto: CreateTaskDto) => invoke<number>('create_task', { dto }),
  update: (dto: UpdateTaskDto) => invoke<void>('update_task', { dto }),
  delete: (id: number) => invoke<void>('delete_task', { id }),
  count: () => invoke<number>('count_tasks'),
};

// Developer API
export const developerApi = {
  list: () => invoke<Developer[]>('list_developers'),
  get: (id: number) => invoke<Developer | null>('get_developer', { id }),
  create: (dto: CreateDeveloperDto) => invoke<number>('create_developer', { dto }),
  update: (dto: UpdateDeveloperDto) => invoke<void>('update_developer', { dto }),
  delete: (id: number) => invoke<void>('delete_developer', { id }),
};

// Sprint API
export const sprintApi = {
  list: () => invoke<Sprint[]>('list_sprints'),
  create: (dto: CreateSprintDto) => invoke<number>('create_sprint', { dto }),
  delete: (id: number) => invoke<void>('delete_sprint', { id }),
};

// Project API
export const projectApi = {
  list: () => invoke<Project[]>('list_projects'),
  create: (dto: { name: string; code?: string; description?: string }) =>
    invoke<number>('create_project', { dto }),
};

// Calendar API
export const calendarApi = {
  getEvents: (startDate: string, endDate: string, developerId?: number) =>
    invoke<CalendarEvent[]>('get_calendar_events', {
      startDate, endDate, developerId: developerId ?? null,
    }),
  getResources: () => invoke<CalendarResource[]>('get_calendar_resources'),
  getWorkload: (developerId: number, startDate: string, endDate: string, includeOvertime?: boolean) =>
    invoke<DeveloperWorkload[]>('get_developer_workload', {
      developerId, startDate, endDate, includeOvertime: includeOvertime ?? false,
    }),
  syncHolidays: (year: number) => invoke<number>('sync_holidays', { year }),
};

// Excel API
export const excelApi = {
  analyze: (filePath: string) => invoke<ExcelFileInfo>('analyze_excel', { filePath }),
  scoreSheets: (filePath: string) => invoke<SheetScore[]>('score_excel_sheets', { filePath }),
  matchColumns: (filePath: string, sheetName: string) =>
    invoke<ColumnMatch[]>('match_excel_columns', { filePath, sheetName }),
  preview: (filePath: string, sheetName: string, limit?: number) =>
    invoke<[string[], string[][]]>('preview_excel_import', { filePath, sheetName, limit }),
  import: (filePath: string, sheetName: string, columnMapping: Record<string, string>) =>
    invoke<ImportResult>('import_excel', { filePath, sheetName, columnMapping }),
  export: (filePath: string, filter: TaskFilter = {}) =>
    invoke<string>('export_excel', { filePath, filter }),
  getHistory: () => invoke<ImportHistory[]>('get_import_history'),
};

// Settings API
export const settingsApi = {
  getLlmConfig: () => invoke<LlmConfig | null>('get_llm_config'),
  saveLlmConfig: (config: LlmConfig) => invoke<void>('save_llm_config', { config }),
  getExcelTemplateConfig: () => invoke<ExcelTemplateConfig | null>('get_excel_template_config'),
  saveExcelTemplateConfig: (config: ExcelTemplateConfig) =>
    invoke<void>('save_excel_template_config', { config }),
  getSetting: (key: string) => invoke<string | null>('get_setting', { key }),
  saveSetting: (key: string, value: string, category: string) =>
    invoke<void>('save_setting', { key, value, category }),
};

// Batch API
export const batchApi = {
  updateTasks: (updates: UpdateTaskDto[]) => invoke<BatchResult>('batch_update_tasks', { updates }),
  deleteTasks: (ids: number[]) => invoke<number>('batch_delete_tasks', { ids }),
  createTasks: (tasks: CreateTaskDto[]) => invoke<number[]>('batch_create_tasks', { tasks }),
};

// LLM API
export const llmApi = {
  chat: (userMessage: string, history: ChatMessage[]) =>
    invoke<LlmChatResponse>('llm_chat', { userMessage, history }),
  executeAction: (action: ChatAction) => invoke<string>('llm_execute_action', { action }),
  smartSchedule: (taskIds: number[], sprintId?: number) =>
    invoke<ScheduleSuggestion[]>('llm_smart_schedule', { taskIds, sprintId: sprintId ?? null }),
  identifySimilarTasks: (taskIds: number[]) =>
    invoke<TaskGroup[]>('llm_identify_similar_tasks', { taskIds }),
  autoFillTasks: (taskIds: number[]) =>
    invoke<UpdateTaskDto[]>('llm_auto_fill_tasks', { taskIds }),
  testConnection: () => invoke<string>('llm_test_connection'),
};
