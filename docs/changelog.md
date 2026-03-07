# DevPlan 更新记录

## v0.3.4 (2026-03-07)

### 功能与优化

- **早会模块改造为集中式 Markdown 编辑**：早会记录从“按人三栏汇报”切换为“按日期单文档”，支持当天集中编辑与 Markdown 预览切换
- **历史早会复用升级**：可查看历史日期记录，并将历史内容按段落拖拽复制到今天的早会文档中，支持按光标位置插入，缺失光标时自动追加到文末
- **数据模型解耦**：早会存储移除人员与任务关联，后端统一改为 `standup_meetings` 的 Markdown 文档读写模型
- **历史数据迁移补齐**：旧早会记录迁移时会同时保留 legacy `notes` 与 `entries` 内容，避免历史信息丢失

### 测试与质量保证

- 新增 Markdown 工具函数测试：
  - `splitMarkdownParagraphs` 段落切分
  - `insertMarkdownBlock` 光标插入 / 文末回退 / 空白块忽略
- 新增早会 Playwright 场景测试：
  - 保存并刷新回显
  - 保存失败提示
  - 历史日期切换
  - 历史段落拖拽复制到光标处
  - 无光标时回退追加文末
  - Markdown 预览切换
  - 空历史状态展示
- 新增 Rust 回归测试：
  - Markdown 保存/读取一致性
  - 空 Markdown 保存
  - 非法日期输入处理
  - 历史迁移幂等与 notes+entries 合并保留

### 发布

- 发布版本：`v0.3.4`
- 版本文件同步更新：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`（及对应 lock 文件）

## v0.3.3 (2026-03-04)

### 功能与优化

- **任务列表与导出排序统一**：默认按计划开始时间排序（空日期置后），Excel 导出复用同一排序规则
- **导出自动继承页面筛选**：导出弹窗会自动带入当前查询条件（含搜索关键词）
- **导出文件命名升级**：默认文件名改为 `所属迭代 + 任务甘特图合并开发任务数量 + 当前日期`
- **导出完成后一键查看**：新增“查看”动作，可直接定位到导出文件所在位置
- **导出列可配置**：设置页新增“导出列顺序”配置，支持自定义列与顺序；默认顺序：
  - Task类型、编号、名称、详细描述、负责人、其他负责人、所属迭代、优先级、计划开始时间、计划结束时间、计划工作量、父级编号、父级项名称、进度

### 发布

- 发布版本：`v0.3.3`
- 版本文件同步更新：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`（及对应 lock 文件）

## v0.3.2 (2026-03-04)

### Bug 修复

- **AI 智能排期/自动分配可能出现单日超载**：新增后端“容量归一化”分配逻辑，LLM 结果改为建议值，最终按开发者 `max_hours_per_day` 与工作日容量逐日排布，避免单日超过上限
- **工时单位语义不一致**：在 AI 排期提示中明确 `hours` 为小时，并按系统配置 `hours_per_day` 进行“天↔小时”换算说明，避免固定 `8h` 语义漂移
- **未排期任务拖拽时天数换算硬编码**：`UnscheduledTaskPanel` 从 `hours/8` 改为 `hours/hoursPerDay`，与设置项保持一致

### 测试与质量保证

- 新增后端回归测试（`llm_commands.rs`）：
  - `normalize_schedule_should_expand_duration_by_daily_capacity`
  - `normalize_schedule_should_skip_fully_loaded_day`
- 验证通过：`cargo check`、`npm run build`、`cargo test normalize_schedule_should -- --nocapture`

### 发布

- 发布版本：`v0.3.2`
- 版本文件同步更新：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`（及对应 lock 文件）

## v0.3.1 (2026-03-02)

### Bug 修复

- **待办任务周视图不显示加班日**：周视图硬编码只显示周一到周五，现在根据设置页面「固定加班日」配置动态扩展显示周六/周日列，加班日用橙色背景标注
- **待办任务/个人日程周视图丢失周一**：修复 dayjs zh-cn locale 下 `startOf('week')` 已返回周一但代码又多加了一天导致从周二开始的问题
- **日历视图切换标签页宽度丢失**：FullCalendar 在 `display:none → block` 切换后无法正确计算宽度，添加 `width:100%`、`minWidth:0` 约束并在标签页激活时调用 `updateSize()` 触发重新布局
- **AI 智能分组编号覆盖已有父编号**：AI 分组应用编号时不再覆盖任务已有的 `parent_number`，编号格式改为 `{父编号}-{AI code}-{序号}`，无父编号时降级为 `{AI code}-{序号}`

### 优化

- 加班日配置 (`overtimeConfig`) 提前到应用启动时加载，避免各组件异步加载时序问题

### 涉及文件

- `src/App.tsx` - 应用启动加载 overtimeConfig
- `src/components/tasks/TodoBoard.tsx` - 周视图加班日显示 + locale 修复
- `src/components/tasks/AiTaskToolbar.tsx` - AI 分组编号格式修复
- `src/components/calendar/CalendarView.tsx` - 标签页切换宽度修复
- `src/components/developers/DeveloperSchedule.tsx` - locale 修复
