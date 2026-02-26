# DevPlan 架构设计文档

## 项目概述
DevPlan 是一个基于 Tauri v2 的本地桌面客户端，用于开发项目管理。

## 技术栈
- **框架**: Tauri v2（Rust 后端 + React 前端）
- **前端**: React 18 + TypeScript + Vite + FullCalendar + Ant Design + Zustand
- **后端**: Rust (calamine, rust_xlsxwriter, rusqlite, serde, chrono, jieba-rs, strsim)
- **数据存储**: SQLite (bundled)

## 系统架构

```
┌─────────────────────────────────────────────┐
│              React 前端 (Vite)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Calendar  │ │  Tasks   │ │ Members  │    │
│  │  Views    │ │  CRUD    │ │ Manage   │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │            │           │
│  ┌────┴─────────────┴────────────┴─────┐    │
│  │         Zustand Store               │    │
│  └────────────────┬────────────────────┘    │
│                   │ @tauri-apps/api         │
└───────────────────┼─────────────────────────┘
                    │ IPC (invoke)
┌───────────────────┼─────────────────────────┐
│              Tauri Commands                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │  Task    │ │Developer │ │  Excel   │    │
│  │ Commands │ │Commands  │ │ Commands │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │            │           │
│  ┌────┴─────────────┴────────────┴─────┐    │
│  │          Services 层                │    │
│  └────────────────┬────────────────────┘    │
│                   │                          │
│  ┌────────────────┴────────────────────┐    │
│  │      Repository 层 (rusqlite)       │    │
│  └────────────────┬────────────────────┘    │
│                   │                          │
│  ┌────────────────┴────────────────────┐    │
│  │          SQLite Database            │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## 数据模型

### developers 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| name | TEXT | 姓名 |
| roles | TEXT(JSON) | 角色列表 |
| skills | TEXT(JSON) | 技能标签 |
| max_hours_per_day | REAL | 每日最大工时 |
| avatar_color | TEXT | 头像颜色 |
| is_active | BOOLEAN | 是否活跃 |

### projects 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| name | TEXT | 项目名称 |
| code | TEXT | 项目编码 |
| description | TEXT | 描述 |

### sprints 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| name | TEXT | 迭代名称 |
| project_id | INTEGER FK | 关联项目 |
| start_date | TEXT | 开始日期 |
| end_date | TEXT | 结束日期 |
| phase | TEXT | 阶段 |

### tasks 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| external_id | TEXT | 外部编号 |
| task_type | TEXT | 任务类型 |
| name | TEXT | 任务名称 |
| description | TEXT | 描述 |
| owner_id | INTEGER FK | 负责人 |
| sprint_id | INTEGER FK | 所属迭代 |
| priority | TEXT | 优先级 |
| planned_start | TEXT | 计划开始日期 |
| planned_end | TEXT | 计划结束日期 |
| planned_hours | REAL | 计划工时 |
| parent_task_id | INTEGER FK | 父任务 |
| status | TEXT | 状态 |

### task_co_owners 表
| 字段 | 类型 | 说明 |
|------|------|------|
| task_id | INTEGER FK | 任务ID |
| developer_id | INTEGER FK | 开发人员ID |

### import_history 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增ID |
| file_name | TEXT | 文件名 |
| file_path | TEXT | 文件路径 |
| import_date | TEXT | 导入时间 |
| sheet_name | TEXT | Sheet名称 |
| column_mapping | TEXT(JSON) | 列映射 |
| rows_imported | INTEGER | 导入行数 |

## 枚举定义

### 任务类型 (TaskType)
需求澄清, 技术预研, 产品设计, UE设计, 架构设计, 详细设计, 代码开发, 代码检查, 演示, 用例设计, 测试执行, 应用检查, JIRA BUG

### 优先级 (Priority)
P0, P1, P2

### 状态 (TaskStatus)
待开始, 进行中, 已完成, 暂停中, 已取消
