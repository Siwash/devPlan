# DevPlan 阶段任务清单

## 阶段 1: 项目基础 ✅ 已完成
- [x] 初始化 Tauri v2 + React + TypeScript + Vite 项目
- [x] 配置 Cargo.toml 依赖 (calamine, rust_xlsxwriter, rusqlite, serde, chrono, jieba-rs, strsim)
- [x] SQLite 数据库建表和初始化 (db/init.rs)
- [x] 数据模型定义 (models/)
- [x] Repository 层实现 (db/task_repo.rs, developer_repo.rs, sprint_repo.rs)
- [x] Services 层实现 (services/)
- [x] Tauri IPC Commands 实现 (commands/)
- [x] 前端基础布局 (AppLayout, Sidebar, Header)
- [x] 路由配置和页面框架
- [x] Zustand 状态管理
- [x] 类型定义和 Tauri 调用封装
- [x] 任务列表表格视图

## 阶段 2: Excel 导入导出 ✅ 已完成
- [x] calamine 读取 Excel (excel/reader.rs)
- [x] 智能 sheet 匹配算法 (excel/smart_matcher.rs)
- [x] 智能列映射算法 (jieba-rs + strsim)
- [x] 列定义配置 (excel/column_definitions.rs)
- [x] Excel 写出 (excel/writer.rs, rust_xlsxwriter)
- [x] 导入向导 UI - Step 1: 选择文件
- [x] 导入向导 UI - Step 2: Sheet 匹配
- [x] 导入向导 UI - Step 3: 列映射（已修复表格滚动和按钮可见性）
- [x] 导入向导 UI - Step 4: 预览导入
- [x] 导出对话框 UI (ExportDialog)
- [x] 导入历史记录

## 阶段 3: 日历视图 ✅ 已完成
- [x] 集成 FullCalendar React 组件
- [x] 月视图 (dayGridMonth)
- [x] 周视图 (timeGridWeek)
- [x] 资源时间线视图 (resourceTimelineMonth)
- [x] 资源可用性计算 (schedule_service.rs)
- [x] 拖拽调整排期
- [x] 事件提示卡和点击详情
- [x] 人员切换 (DeveloperSelector)
- [x] 维度切换 (Segmented: 任务维度/人员维度/迭代维度)

## 阶段 4: 成员管理 + 甘特图 ✅ 已完成
- [x] 成员档案 CRUD (DeveloperList)
- [x] 个人日程视图 (DeveloperSchedule) - 含工作量柱状图
- [x] 工作量可视化图表 (柱状图 + 颜色分级)
- [x] 超负荷预警 (Alert 组件)
- [x] 甘特图视图 (GanttView)

## 阶段 5: LLM 集成（预留） ✅ 接口已定义
- [x] LlmAdapter trait 定义
- [x] analyze_sheet_mapping() 接口
- [x] suggest_schedule() 接口
- [ ] OpenAI 兼容适配器实现（后续实现）

## UI/UX 优化记录

### 第一轮修复
- [x] ImportWizard Step 2-4 表格增加 scroll={{ y: N }} 防止按钮被推到视口外
- [x] ImportWizard Step 5 结果页错误列表增加 maxHeight 限制
- [x] handleColumnMappingChange 修复 undefined field 导致的 bug

### 第二轮修复（6 项用户反馈）
- [x] AppLayout Content 区域增加 height 计算和 overflow: auto，解决列表无法滚动问题
- [x] TaskList 改为手动查询模式：增加查询/重置按钮，避免无效组合自动触发查询
- [x] taskStore setFilter 解耦 fetchTasks，支持手动搜索触发
- [x] DeveloperList 技能标签输入：Select mode="tags" 增加 tokenSeparators 支持逗号/空格分隔
- [x] DeveloperSchedule 增加 DatePicker.RangePicker 日期范围筛选
- [x] DeveloperSchedule 改为多人模式：Select mode="multiple" 支持同时查看多人工作负载对比
- [x] CalendarView 增加 Segmented 维度切换（任务维度/人员维度/迭代维度）

### 第三轮修复（4 项用户反馈）
- [x] CalendarView 维度切换增加颜色图例（Tag 展示当前维度下各颜色含义）
- [x] DeveloperSchedule 多人模式改为 SVG 折线图（更容易看趋势对比），保留单人柱状图
- [x] GanttView 修复迭代筛选无效（setFilter 解耦后需显式调用 fetchTasks）
- [x] 新增 TodoBoard 待办视图：默认当天、支持日/周维度切换、按成员和日期筛选

## 当前状态
- 应用已成功运行（npx tauri dev）
- 所有核心功能已完成
- Vite HMR 正常工作
- UI/UX 三轮优化已完成
- 新增待办视图为默认首页
- 仅剩 LLM 适配器实现为后续任务
