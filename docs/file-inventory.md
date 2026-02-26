# DevPlan 项目文件清单

## Rust 后端 (src-tauri/)

### 配置文件
- `Cargo.toml` - Rust 依赖配置
- `tauri.conf.json` - Tauri 应用配置（窗口大小、权限等）
- `capabilities/default.json` - Tauri v2 权限配置（dialog、fs）
- `build.rs` - Tauri 构建脚本

### 数据模型 (src/models/)
- `mod.rs` - 模块导出
- `enums.rs` - 枚举定义（TaskType, Priority, TaskStatus）
- `developer.rs` - Developer 结构体和 DTO
- `sprint.rs` - Sprint/Project 结构体和 DTO
- `task.rs` - Task 结构体、DTO 和 Filter
- `calendar.rs` - CalendarEvent, CalendarResource, DeveloperWorkload

### 数据库层 (src/db/)
- `mod.rs` - AppDatabase 结构体（SQLite 连接管理）
- `init.rs` - 建表 SQL（developers, projects, sprints, tasks, task_co_owners, import_history）
- `task_repo.rs` - 任务 CRUD（含动态过滤、日期范围查询）
- `developer_repo.rs` - 成员 CRUD（含按名查找/自动创建）
- `sprint_repo.rs` - 迭代/项目 CRUD

### 业务服务层 (src/services/)
- `mod.rs` - 模块导出
- `task_service.rs` - 任务业务逻辑
- `developer_service.rs` - 成员业务逻辑
- `schedule_service.rs` - 日历事件生成、资源可用性计算、工作量统计
- `import_export_service.rs` - Excel 数据导入（自动创建开发人员/迭代）

### Tauri 命令层 (src/commands/)
- `mod.rs` - 模块导出
- `task_commands.rs` - 6个任务相关 IPC 命令
- `developer_commands.rs` - 5个成员相关 IPC 命令
- `sprint_commands.rs` - 5个迭代/项目 IPC 命令
- `calendar_commands.rs` - 3个日历相关 IPC 命令
- `excel_commands.rs` - 7个 Excel 导入导出 IPC 命令

### Excel 处理 (src/excel/)
- `mod.rs` - 模块导出
- `reader.rs` - calamine 读取 Excel（sheet 信息、行数据、HashMap 转换）
- `writer.rs` - rust_xlsxwriter 导出 Excel（格式化表头、列宽）
- `smart_matcher.rs` - 智能 Sheet 评分算法、列映射算法（jieba-rs + strsim）
- `column_definitions.rs` - 任务字段定义（中英文关键词、数据类型）

### LLM 预留 (src/llm/)
- `mod.rs` - 模块导出
- `adapter.rs` - LlmAdapter trait 定义（analyze_sheet_mapping, suggest_schedule）

### 入口
- `main.rs` - Windows 入口
- `lib.rs` - Tauri Builder 配置（插件注册、数据库初始化、命令注册）

## React 前端 (src/)

### 入口
- `main.tsx` - React 入口（ConfigProvider + HashRouter）
- `App.tsx` - 路由配置（tasks, calendar, developers, schedule, gantt, import）
- `styles.css` - 全局样式

### 类型和 API (src/lib/)
- `types.ts` - TypeScript 类型定义（与 Rust 模型对应）+ 枚举常量
- `api.ts` - Tauri invoke 封装（taskApi, developerApi, sprintApi, calendarApi, excelApi）
- `index.ts` - 导出

### 状态管理 (src/stores/)
- `taskStore.ts` - Zustand 任务状态（列表、筛选、CRUD）
- `developerStore.ts` - Zustand 成员状态
- `sprintStore.ts` - Zustand 迭代/项目状态

### 布局组件 (src/components/layout/)
- `AppLayout.tsx` - 主布局（Sider + Header + Content）

### 任务组件 (src/components/tasks/)
- `TaskList.tsx` - 任务列表（表格 + 筛选 + 手动查询/重置 + 分页）
- `TaskForm.tsx` - 任务创建/编辑表单（Modal）
- `TodoBoard.tsx` - 待办任务看板（日/周视图 + 成员日期筛选 + 按人员分组）

### 日历组件 (src/components/calendar/)
- `CalendarView.tsx` - FullCalendar 集成（月/周/资源时间线视图 + 任务/人员/迭代维度切换 + 颜色图例）

### 成员组件 (src/components/developers/)
- `DeveloperList.tsx` - 成员卡片列表（CRUD + 技能标签自由输入）
- `DeveloperSchedule.tsx` - 个人日程视图（日期范围筛选 + 多人折线图对比 + 单人柱状图 + 超负荷预警）

### 甘特图组件 (src/components/gantt/)
- `GanttView.tsx` - 简易甘特图（CSS 实现）

### Excel 组件 (src/components/excel/)
- `ImportWizard.tsx` - 四步导入向导（选文件→Sheet匹配→列映射→预览导入）
- `ExportDialog.tsx` - 导出对话框（筛选条件 + 文件保存）

### 通用组件 (src/components/common/)
- `StatusBadge.tsx` - 状态/优先级/类型标签

## 文档 (docs/)
- `architecture.md` - 架构设计文档
- `task-phases.md` - 阶段任务清单
- `file-inventory.md` - 本文件
