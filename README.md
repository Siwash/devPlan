# DevPlan - 开发项目管理工具

DevPlan 是一款面向小型开发团队的本地优先项目管理桌面应用，基于 Tauri 2 构建，数据全部存储在本地 SQLite 数据库中，无需服务端部署。

## 功能特性

### 任务管理
- **任务列表** — 可内联编辑的表格，支持类型、优先级、负责人、迭代、日期、工时等字段
- **待办看板** — 按状态分列的看板视图，支持周视图
- **Excel 导入/导出** — 智能列映射，自动创建缺失的人员和迭代
- **批量操作** — 多选后批量更新、删除；Excel 式拖拽填充柄
- **剪贴板粘贴** — 从 Excel 复制行直接粘贴创建任务

### 可视化
- **甘特图** — 按迭代/分组展示任务时间线，支持折叠和缩放
- **日历视图** — FullCalendar 集成，按人员筛选
- **个人日程** — 每日工时分配柱状图 + 多人趋势对比折线图，超负荷预警
- **中国节假日** — 在线同步法定节假日和调休补班数据

### AI 能力（需配置 LLM API）
- **AI 对话** — 项目上下文感知的智能助手，可查询分析任务数据
- **智能排期** — 根据人员技能和工时约束自动分配日期
- **智能分组** — 识别同功能/同模块的任务并建议编号前缀
- **自动分配** — 按技能匹配为未分配任务指派负责人
- **AI 创建任务** — 对话中直接创建任务，支持人名和迭代名自动映射

### 其他
- **工时单位配置** — 天/小时自由切换，数据库始终以小时存储
- **多标签页** — 同时打开多个页面，快速切换
- **开发成员管理** — 角色、技能、每日最大工时配置

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | [Tauri 2](https://tauri.app/) |
| 前端 | React 19 + TypeScript + Vite |
| UI 组件 | Ant Design 5 |
| 状态管理 | Zustand |
| 后端 | Rust |
| 数据库 | SQLite (rusqlite) |
| Excel | calamine (读) + rust_xlsxwriter (写) |
| 日历 | FullCalendar |
| LLM | OpenAI 兼容 API (ureq) |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.77
- [Tauri 2 CLI 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 开发运行

```bash
# 安装前端依赖
npm install

# 启动开发模式（同时启动 Vite 和 Tauri）
npm run tauri dev
```

### 构建发布

```bash
npm run tauri build
```

构建产物在 `src-tauri/target/release/bundle/` 目录下。

## 下载安装

前往 [Releases](../../releases) 页面下载对应平台的安装包：

| 平台 | 文件 |
|------|------|
| Windows | `.msi` / `.exe` |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x86_64) |

> macOS 未签名应用首次打开方式：右键点击应用 → 打开，或在终端执行 `xattr -cr /Applications/DevPlan.app`

## 项目结构

```
devPlan/
├── src/                          # 前端源码
│   ├── components/
│   │   ├── tasks/                # 任务列表、看板、AI工具栏
│   │   ├── gantt/                # 甘特图
│   │   ├── calendar/             # 日历视图
│   │   ├── developers/           # 成员管理、个人日程
│   │   ├── chat/                 # AI 对话面板
│   │   ├── excel/                # Excel 导入/导出
│   │   ├── settings/             # 设置页面
│   │   └── layout/               # 布局、标签页
│   ├── stores/                   # Zustand 状态管理
│   ├── lib/                      # API 封装、类型定义、工具函数
│   └── styles.css                # 全局样式
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── commands/             # Tauri 命令 (前后端桥接)
│       ├── services/             # 业务逻辑
│       ├── db/                   # 数据库初始化、CRUD
│       ├── models/               # 数据模型
│       └── llm/                  # LLM 适配器
└── docs/                         # 设计文档
```

## LLM 配置

在设置页面填写 OpenAI 兼容 API 信息即可启用 AI 功能：

- **API URL** — 例如 `https://api.openai.com/v1`
- **API Key**
- **模型** — 支持 GPT-4o、Claude、DeepSeek、Qwen 等

所有 AI 请求在本地发起，数据不经过第三方中转。

## License

MIT
