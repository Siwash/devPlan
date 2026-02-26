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
- [x] OpenAI 兼容适配器实现

## 阶段 6: 设置系统 + 多页签导航 ✅ 已完成
- [x] 新增 app_settings 数据表（key-value + category）
- [x] Settings CRUD: settings_repo、settings_service、settings_commands
- [x] LlmConfig / ExcelTemplateConfig 数据模型
- [x] 前端 settingsApi + settingsStore
- [x] 设置页面 UI（LLM 配置 Tab + Excel 模板配置 Tab）
- [x] Header 齿轮图标关联设置页签
- [x] tabStore（Zustand）管理多页签状态
- [x] TabBar 组件（Ant Design Tabs editable-card）
- [x] App.tsx 改为 keep-alive 渲染（CSS display 切换，不卸载组件）
- [x] AppLayout 侧边栏菜单集成 tabStore
- [x] 切换页签保留筛选条件和滚动位置

## 阶段 7: 动态编辑表格 ✅ 已完成
- [x] 后端批量操作: batch_update_tasks、batch_delete_tasks、batch_create_tasks（事务包裹）
- [x] BatchResult 数据模型
- [x] 前端 batchApi
- [x] EditableCell 通用编辑单元格组件（text/select/date/number 四种类型）
- [x] EditableTaskTable 内联编辑表格（点击编辑、失焦保存、500ms 防抖）
- [x] useClipboardPaste Hook（监听粘贴事件、解析 Excel tab 分隔数据）
- [x] TaskList 集成编辑表格（移除 Modal 编辑模式）
- [x] 支持从 Excel 粘贴多行数据批量创建
- [x] 表格底部 "+" 按钮快速新建任务

## 阶段 8: LLM 智能集成 ✅ 已完成
- [x] OpenAI 兼容适配器（openai_adapter.rs，ureq HTTP 调用 /v1/chat/completions）
- [x] LLM 服务层（llm_service.rs）
  - [x] chat_with_context() — 带项目上下文的对话
  - [x] ai_smart_schedule() — 智能排期（8h/天、排除周末、均衡分配）
  - [x] ai_identify_similar_tasks() — 识别同名前缀任务分组
  - [x] ai_auto_fill_tasks() — 自动分配开发人员和日期
  - [x] execute_chat_action() — 执行 AI 建议的批量操作
- [x] LLM Commands: llm_chat、llm_execute_action、llm_smart_schedule、llm_identify_similar_tasks、llm_auto_fill_tasks、llm_test_connection
- [x] 前端 llmApi + chatStore
- [x] ChatPanel 对话面板（全页 + Drawer 两种模式）
- [x] ChatMessage 消息渲染 + ActionCard 操作预览卡片
- [x] AiTaskToolbar 任务列表 AI 工具栏（智能分组、智能排期、自动分配）
- [x] Header 添加 AI 对话入口图标（RobotOutlined）
- [x] AI 对话页签路由 /chat

## CI/CD
- [x] GitHub Actions release.yml（双平台构建 Windows + macOS，tag 触发）

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

### 第四轮优化（设置 + AI 体验）
- [x] LLM 配置模型选择器改为 mode="tags" 支持手动输入任意模型名（不再限于固定列表）
- [x] LLM 预设模型列表扩充（GPT-4.1、Claude Opus 4、DeepSeek Reasoner、Qwen Plus）
- [x] Excel 模板配置新增内置默认映射数据（10 列标准映射：编号/类型/名称/负责人/迭代/优先级/日期/工时/状态）
- [x] Excel 模板配置增加说明文字和"恢复默认"按钮
- [x] 任务列表"新增任务"按钮提升到标题栏右侧（蓝色 primary 按钮，更醒目）
- [x] AI 工具栏按钮加载时显示蓝色提示文字（"正在调用 AI 进行智能排期..."），加载中禁用其他按钮

### 第五轮优化（AI 对话体验全面升级）
- [x] 后端 LLM 流式输出：openai_adapter 新增 SSE streaming 方法，通过 Tauri 事件逐块推送
- [x] llm_chat 命令接受 AppHandle 参数，使用流式调用
- [x] chatStore 重写：监听 llm-stream-chunk 事件，实时更新消息内容
- [x] ChatPanel 全面重设计：欢迎页（渐变色头像 + 快捷提问按钮 2x2 网格）、输入区 flex 对齐、居中限宽
- [x] ChatMessage 集成 react-markdown + remark-gfm 渲染 Markdown（代码块暗色主题、表格、列表等）
- [x] 流式输出时显示蓝色闪烁光标动画
- [x] 用户/AI 消息各有圆形彩色头像区分
- [x] ActionCard 优化：action_type 显示中文标签，横向紧凑布局

### 第六轮优化（AI 工具栏流式交互 + 高亮标注）
- [x] 后端三个 AI 命令（智能排期/分组/自动分配）添加 AppHandle 改为流式输出
- [x] Prompt 优化：要求 LLM 先分析思路再给 JSON 结果，流式过程中用户可看到分析文字
- [x] AiTaskToolbar 全面重写：点击即开 Modal，流式展示 AI 分析过程（Markdown 渲染 + 光标动画）
- [x] 分析完成后展示结构化结果表格，显示任务名称和人员名称（而非仅 ID）
- [x] 排期/分配结果弹窗底部醒目的"一键应用全部"按钮
- [x] AI 操作基于当前筛选条件的任务列表，而非全部任务
- [x] EditableTaskTable 支持 highlightedRowIds prop，AI 修改的行显示蓝色左边框 + 浅蓝背景
- [x] 高亮效果 7 秒后自动消退（CSS animation）

### 第七轮修复（AI 连接体验 + 分组应用 + 性能诊断）
- [x] 后端 openai_adapter 在 HTTP 连接成功后立即发送 `llm-stream-start` 事件，区分"连接中"和"思考中"
- [x] AiTaskToolbar 监听 `llm-stream-start` 事件，连接后显示"AI 正在思考中"替代长时间"正在连接 AI 服务..."
- [x] 智能分组结果弹窗新增"应用分组编号"按钮（根据 suggested_external_prefix 批量更新 external_id）
- [x] Prompt 全面压缩：三个 AI 函数改用紧凑文本格式替代 `to_string_pretty()`，token 数减少约 60%
- [x] 后端新增 4 个 Tauri 事件（llm-stream-start/first-token/chunk/done），携带精确计时和 token usage
- [x] 流式请求添加 `stream_options: { include_usage: true }`，从 SSE 最终 chunk 解析真实 token 消耗
- [x] Modal 等待状态显示实时秒数计时器 + 模型名 + 网络连接耗时
- [x] Modal 底部新增"请求日志"面板：模型名、网络连接耗时、TTFT、总耗时、prompt/completion/total tokens

### 第八轮优化（深度思考可视化 + 性能优化）
- [x] 后端 openai_adapter 解析 SSE 中的 `reasoning_content` 字段（Qwen3/DeepSeek-R1 思考内容）
- [x] 新增 `llm-stream-thinking` 和 `llm-stream-thinking-start` 事件，实时推送思考内容
- [x] `chat_completion_stream` 新增 `enable_thinking` 参数，支持显式开关深度思考
- [x] AI 工具栏三个功能（智能分组/排期/自动分配）传 `enable_thinking: false` 关闭深度思考，大幅减少 token 消耗和等待时间
- [x] AI 对话保持深度思考开启，thinking 内容实时流式展示
- [x] AiTaskToolbar Modal 新增黄色"模型思考过程"区域，实时流式展示思维链
- [x] ChatMessage 组件新增可折叠思考过程展示（💭 标签，点击展开/收起）
- [x] chatStore 新增 `thinking` 字段和 `llm-stream-thinking` 事件监听
- [x] 请求日志区分思考 tokens 和输出 tokens

### 第九轮修复（DB 锁竞争导致 UI 卡死）
- [x] 重构 `llm_commands.rs`：所有 LLM 命令将 DB 锁限定在数据读取作用域内，读完即释放，HTTP 调用不再持有锁
- [x] 重构 `llm_service.rs`：AI 函数改为接受预取数据（Task/Developer/Sprint 切片）而非 `&Connection`，解耦 DB 访问与网络请求
- [x] `llm_test_connection` 同样改为作用域锁，只在读取配置时持锁
- [x] `llm_execute_action` 保持原有锁模式（纯 DB 写操作，耗时极短）

## 当前状态
- 所有 8 个阶段已完成
- 新增设置系统（LLM 配置 + Excel 模板配置）
- 多页签导航（keep-alive 保持状态）
- 动态编辑表格（内联编辑 + Excel 粘贴）
- LLM 智能集成（AI 对话 + 智能排期 + 智能分组 + 自动分配）
- AI 全链路流式输出（对话面板 + 工具栏均支持 SSE 流式）
- AI 修改数据高亮标注 + Markdown 渲染
- CI/CD: GitHub Actions 双平台构建
- 新增 Tauri 命令 15 个（settings 6 + batch 3 + llm 6），总计 41 个
