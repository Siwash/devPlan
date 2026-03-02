# DevPlan 更新记录

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
