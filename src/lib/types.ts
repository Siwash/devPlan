// Task types
export interface Task {
  id: number;
  external_id?: string;
  task_type?: string;
  name: string;
  description?: string;
  owner_id?: number;
  owner_name?: string;
  sprint_id?: number;
  sprint_name?: string;
  priority?: string;
  planned_start?: string;
  planned_end?: string;
  planned_hours?: number;
  parent_task_id?: number;
  status?: string;
  co_owners?: CoOwner[];
}

export interface CoOwner {
  developer_id: number;
  developer_name: string;
}

export interface CreateTaskDto {
  external_id?: string;
  task_type?: string;
  name: string;
  description?: string;
  owner_id?: number;
  sprint_id?: number;
  priority?: string;
  planned_start?: string;
  planned_end?: string;
  planned_hours?: number;
  parent_task_id?: number;
  status?: string;
  co_owner_ids?: number[];
}

export interface UpdateTaskDto {
  id: number;
  external_id?: string;
  task_type?: string;
  name?: string;
  description?: string;
  owner_id?: number;
  sprint_id?: number;
  priority?: string;
  planned_start?: string;
  planned_end?: string;
  planned_hours?: number;
  parent_task_id?: number;
  status?: string;
  co_owner_ids?: number[];
}

export interface TaskFilter {
  sprint_id?: number;
  owner_id?: number;
  status?: string;
  task_type?: string;
  priority?: string;
  search?: string;
}

// Developer types
export interface Developer {
  id: number;
  name: string;
  roles: string[];
  skills: string[];
  max_hours_per_day: number;
  avatar_color: string;
  is_active: boolean;
}

export interface CreateDeveloperDto {
  name: string;
  roles?: string[];
  skills?: string[];
  max_hours_per_day?: number;
  avatar_color?: string;
}

export interface UpdateDeveloperDto {
  id: number;
  name?: string;
  roles?: string[];
  skills?: string[];
  max_hours_per_day?: number;
  avatar_color?: string;
  is_active?: boolean;
}

// Sprint/Project types
export interface Sprint {
  id: number;
  name: string;
  project_id?: number;
  start_date?: string;
  end_date?: string;
  phase?: string;
}

export interface Project {
  id: number;
  name: string;
  code: string;
  description: string;
}

export interface CreateSprintDto {
  name: string;
  project_id?: number;
  start_date?: string;
  end_date?: string;
  phase?: string;
}

// Calendar types
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  resourceId?: string;
  resource_id?: string;
  color?: string;
  extendedProps?: CalendarEventExtProps;
  ext_props?: CalendarEventExtProps;
}

export interface CalendarEventExtProps {
  task_id: number;
  task_type?: string;
  priority?: string;
  status?: string;
  owner_name?: string;
  planned_hours?: number;
  sprint_id?: number;
  sprint_name?: string;
}

export interface CalendarResource {
  id: string;
  title: string;
  avatar_color?: string;
}

export interface DeveloperWorkload {
  developer_id: number;
  developer_name: string;
  date: string;
  allocated_hours: number;
  max_hours: number;
  available_hours: number;
  tasks: WorkloadTask[];
  is_overtime: boolean;
}

export interface WorkloadTask {
  task_id: number;
  task_name: string;
  daily_hours: number;
}

// Excel types
export interface ExcelFileInfo {
  file_name: string;
  sheets: SheetInfo[];
}

export interface SheetInfo {
  name: string;
  row_count: number;
  col_count: number;
  headers: string[];
  sample_rows: string[][];
  is_hidden: boolean;
}

export interface SheetScore {
  sheet_name: string;
  score: number;
  reasons: string[];
}

export interface ColumnMatch {
  header: string;
  header_index: number;
  matched_field?: string;
  matched_label?: string;
  confidence: number;
  match_method: string;
}

export interface ImportResult {
  rows_imported: number;
  developers_created: string[];
  sprints_created: string[];
  errors: string[];
}

export interface ImportHistory {
  id: number;
  file_name: string;
  file_path?: string;
  import_date: string;
  sheet_name?: string;
  column_mapping?: string;
  rows_imported: number;
}

// Enum values
export const TASK_TYPES = [
  '需求澄清', '技术预研', '产品设计', 'UE设计', '架构设计',
  '详细设计', '代码开发', '代码检查', '演示', '用例设计',
  '测试执行', '应用检查', 'JIRA BUG',
];

export const PRIORITIES = ['P0', 'P1', 'P2'];

export const TASK_STATUSES = ['待开始', '进行中', '已完成', '暂停中', '已取消'];

export const TASK_TYPE_COLORS: Record<string, string> = {
  '需求澄清': '#1890ff',
  '技术预研': '#722ed1',
  '产品设计': '#13c2c2',
  'UE设计': '#eb2f96',
  '架构设计': '#fa8c16',
  '详细设计': '#a0d911',
  '代码开发': '#52c41a',
  '代码检查': '#2f54eb',
  '演示': '#fadb14',
  '用例设计': '#f5222d',
  '测试执行': '#faad14',
  '应用检查': '#ff7a45',
  'JIRA BUG': '#f5222d',
};

export const STATUS_COLORS: Record<string, string> = {
  '待开始': '#d9d9d9',
  '进行中': '#1890ff',
  '已完成': '#52c41a',
  '暂停中': '#faad14',
  '已取消': '#ff4d4f',
};

export const PRIORITY_COLORS: Record<string, string> = {
  P0: '#f5222d',
  P1: '#fa8c16',
  P2: '#1890ff',
};
