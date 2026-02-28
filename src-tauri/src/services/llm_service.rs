use rusqlite::Connection;
use crate::llm::adapter::{ChatMessage, ChatAction, LlmChatResponse, TaskGroup, ScheduleSuggestion, TokenUsage};
use crate::llm::openai_adapter::OpenAiCompatibleAdapter;
use crate::models::settings::LlmConfig;
use crate::models::task::{Task, UpdateTaskDto};
use crate::models::developer::Developer;
use crate::models::sprint::Sprint;

pub fn chat_with_context(
    config: &LlmConfig,
    user_message: &str,
    conversation_history: &[ChatMessage],
    developers: &[Developer],
    sprints: &[Sprint],
    task_count: i64,
    hours_per_day: f64,
) -> Result<LlmChatResponse, String> {
    let adapter = OpenAiCompatibleAdapter::new(config);
    let messages = build_chat_messages(user_message, conversation_history, developers, sprints, task_count, &[], hours_per_day)?;
    let response = adapter.chat_completion(&messages, Some(0.7))?;
    let actions = parse_actions(&response.content);

    Ok(LlmChatResponse {
        message: response.content,
        actions,
        usage: response.usage,
    })
}

pub fn chat_with_context_stream(
    config: &LlmConfig,
    user_message: &str,
    conversation_history: &[ChatMessage],
    app_handle: &tauri::AppHandle,
    developers: &[Developer],
    sprints: &[Sprint],
    task_count: i64,
    tasks: &[Task],
    hours_per_day: f64,
) -> Result<LlmChatResponse, String> {
    let adapter = OpenAiCompatibleAdapter::new(config);
    let messages = build_chat_messages(user_message, conversation_history, developers, sprints, task_count, tasks, hours_per_day)?;
    let response = adapter.chat_completion_stream(&messages, Some(0.7), app_handle, None)?;
    let actions = parse_actions(&response.content);

    Ok(LlmChatResponse {
        message: response.content,
        actions,
        usage: response.usage,
    })
}

fn build_chat_messages(
    user_message: &str,
    conversation_history: &[ChatMessage],
    developers: &[Developer],
    sprints: &[Sprint],
    task_count: i64,
    tasks: &[Task],
    hours_per_day: f64,
) -> Result<Vec<ChatMessage>, String> {
    let dev_list: Vec<String> = developers.iter()
        .map(|d| format!("  - {} (ID:{}, 角色:{:?}, 技能:{:?}, 日最大工时:{}h)", d.name, d.id, d.roles, d.skills, d.max_hours_per_day))
        .collect();

    let sprint_list: Vec<String> = sprints.iter()
        .map(|s| format!("  - {} (ID:{}, {}~{})", s.name, s.id, s.start_date.as_deref().unwrap_or("?"), s.end_date.as_deref().unwrap_or("?")))
        .collect();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Build compact task list for AI context
    let task_context = if !tasks.is_empty() {
        let task_items: Vec<String> = tasks.iter().take(200).map(|t| {
            format!("{{id:{},name:\"{}\",type:\"{}\",owner:\"{}\",sprint:\"{}\",status:\"{}\",start:\"{}\",end:\"{}\",hours:{}}}",
                t.id,
                t.name.chars().take(30).collect::<String>(),
                t.task_type.as_deref().unwrap_or("-"),
                t.owner_name.as_deref().unwrap_or("-"),
                t.sprint_name.as_deref().unwrap_or("-"),
                t.status.as_deref().unwrap_or("-"),
                t.planned_start.as_deref().unwrap_or("-"),
                t.planned_end.as_deref().unwrap_or("-"),
                t.planned_hours.map(|h| h.to_string()).unwrap_or("-".to_string()),
            )
        }).collect();
        let truncated = if tasks.len() > 200 {
            format!("\n  (仅显示前200个,共{}个任务)", tasks.len())
        } else {
            String::new()
        };
        format!("\n- 任务列表(共{}个):\n  [{}]{}", tasks.len(), task_items.join(","), truncated)
    } else {
        String::new()
    };

    let system_prompt = format!(
r#"你是 DevPlan 项目管理助手，帮助用户管理开发任务。

当前项目上下文:
- 今天: {}
- 任务总数: {}
- 开发人员:
{}
- 迭代:
{}{}

你可以执行以下操作，在回复中包含 JSON action 代码块:

1. 批量更新任务:
```action
{{"action_type": "batch_update", "description": "描述", "payload": {{"updates": [{{"id": 1, "status": "进行中"}}]}}, "requires_confirmation": true}}
```

2. 批量删除任务:
```action
{{"action_type": "batch_delete", "description": "描述", "payload": {{"ids": [1, 2, 3]}}, "requires_confirmation": true}}
```

3. 创建任务:
```action
{{"action_type": "batch_create", "description": "描述", "payload": {{"tasks": [{{"name": "任务名", "task_type": "代码开发", "owner_name": "张三", "sprint_name": "Sprint4", "priority": "P1", "planned_start": "2026-03-01", "planned_end": "2026-03-05", "planned_hours": 16, "status": "待开始"}}]}}, "requires_confirmation": true}}
```

规则:
- 每人每天最多工作{}小时
- 周末和中国法定节假日不工作
- 任务日期不能与已有任务冲突
- 先解释你的分析，再给出action建议
- action 必须用 ```action 代码块包裹
- 创建任务时使用 owner_name(人名) 和 sprint_name(迭代名) 而非 ID"#,
        today, task_count, dev_list.join("\n"), sprint_list.join("\n"), task_context, hours_per_day as i64
    );

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: system_prompt,
    }];

    // Add conversation history
    for msg in conversation_history {
        messages.push(msg.clone());
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: user_message.to_string(),
    });

    Ok(messages)
}

fn parse_actions(content: &str) -> Vec<ChatAction> {
    let mut actions = Vec::new();
    let mut in_action_block = false;
    let mut block_content = String::new();

    for line in content.lines() {
        if line.trim() == "```action" {
            in_action_block = true;
            block_content.clear();
        } else if in_action_block && line.trim() == "```" {
            in_action_block = false;
            if let Ok(action) = serde_json::from_str::<ChatAction>(&block_content) {
                actions.push(action);
            }
        } else if in_action_block {
            block_content.push_str(line);
            block_content.push('\n');
        }
    }

    actions
}

pub fn execute_chat_action(
    conn: &Connection,
    action: &ChatAction,
    developers: &[Developer],
    sprints: &[Sprint],
) -> Result<String, String> {
    match action.action_type.as_str() {
        "batch_update" => {
            let updates: Vec<UpdateTaskDto> = serde_json::from_value(
                action.payload["updates"].clone()
            ).map_err(|e| format!("Invalid update payload: {}", e))?;

            let result = crate::services::task_service::batch_update_tasks(conn, &updates)?;
            Ok(format!("成功更新 {} 个任务, 失败 {} 个", result.success_count, result.fail_count))
        }
        "batch_delete" => {
            let ids: Vec<i64> = serde_json::from_value(
                action.payload["ids"].clone()
            ).map_err(|e| format!("Invalid delete payload: {}", e))?;

            let count = crate::services::task_service::batch_delete_tasks(conn, &ids)?;
            Ok(format!("成功删除 {} 个任务", count))
        }
        "batch_create" => {
            // Parse with intermediate struct that supports name-based references
            let ai_tasks: Vec<serde_json::Value> = serde_json::from_value(
                action.payload["tasks"].clone()
            ).map_err(|e| format!("Invalid create payload: {}", e))?;

            let mut create_dtos: Vec<crate::models::task::CreateTaskDto> = Vec::new();
            for ai_task in &ai_tasks {
                // Resolve owner_name → owner_id
                let owner_id = ai_task.get("owner_name")
                    .and_then(|v| v.as_str())
                    .and_then(|name| developers.iter().find(|d| d.name.trim() == name.trim()).map(|d| d.id))
                    .or_else(|| ai_task.get("owner_id").and_then(|v| v.as_i64()));

                // Resolve sprint_name → sprint_id
                let sprint_id = ai_task.get("sprint_name")
                    .and_then(|v| v.as_str())
                    .and_then(|name| sprints.iter().find(|s| s.name.trim() == name.trim()).map(|s| s.id))
                    .or_else(|| ai_task.get("sprint_id").and_then(|v| v.as_i64()));

                let dto = crate::models::task::CreateTaskDto {
                    external_id: ai_task.get("external_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    task_type: ai_task.get("task_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    name: ai_task.get("name").and_then(|v| v.as_str()).unwrap_or("未命名").to_string(),
                    description: ai_task.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    owner_id,
                    sprint_id,
                    priority: ai_task.get("priority").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    planned_start: ai_task.get("planned_start").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    planned_end: ai_task.get("planned_end").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    planned_hours: ai_task.get("planned_hours").and_then(|v| v.as_f64()),
                    parent_task_id: ai_task.get("parent_task_id").and_then(|v| v.as_i64()),
                    parent_number: ai_task.get("parent_number").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    parent_name: ai_task.get("parent_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    status: ai_task.get("status").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    co_owner_ids: None,
                };
                create_dtos.push(dto);
            }

            let ids = crate::services::task_service::batch_create_tasks(conn, &create_dtos)?;
            Ok(format!("成功创建 {} 个任务", ids.len()))
        }
        _ => Err(format!("Unknown action type: {}", action.action_type)),
    }
}

pub fn ai_smart_schedule(
    config: &LlmConfig,
    tasks: &[Task],
    developers: &[Developer],
    app_handle: Option<&tauri::AppHandle>,
) -> Result<Vec<ScheduleSuggestion>, String> {
    let adapter = OpenAiCompatibleAdapter::new(config);

    let tasks_desc: Vec<String> = tasks.iter().map(|t| {
        format!("{{id:{},name:\"{}\",type:\"{}\",priority:\"{}\",hours:{},status:\"{}\"}}",
            t.id, t.name,
            t.task_type.as_deref().unwrap_or("-"),
            t.priority.as_deref().unwrap_or("-"),
            t.planned_hours.map(|h| h.to_string()).unwrap_or("-".to_string()),
            t.status.as_deref().unwrap_or("-"))
    }).collect();

    let devs_desc: Vec<String> = developers.iter().map(|d| {
        format!("{{id:{},name:\"{}\",roles:{:?},skills:{:?},max_h:{}}}",
            d.id, d.name, d.roles, d.skills, d.max_hours_per_day)
    }).collect();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let prompt = format!(
r#"为以下{}个任务排期。
任务:[{}]
人员:[{}]
今天:{}
规则:每人每天≤8h,排除周末,均衡分配,技能匹配。
直接返回JSON数组,不要输出任何其他文字。每项:task_id(int),developer_id(int),planned_start(YYYY-MM-DD),planned_end(YYYY-MM-DD),reasoning(简短一句话)"#,
        tasks.len(),
        tasks_desc.join(","),
        devs_desc.join(","),
        today,
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = if let Some(handle) = app_handle {
        adapter.chat_completion_stream(&messages, Some(0.3), handle, Some(false))?
    } else {
        adapter.chat_completion(&messages, Some(0.3))?
    };

    let content = response.content.trim();
    let json_str = extract_json_array(content);

    serde_json::from_str::<Vec<ScheduleSuggestion>>(&json_str)
        .map_err(|e| format!("Failed to parse schedule suggestions: {}. Response: {}", e, content))
}

pub fn ai_identify_similar_tasks(
    config: &LlmConfig,
    tasks: &[Task],
    app_handle: Option<&tauri::AppHandle>,
) -> Result<Vec<TaskGroup>, String> {
    let adapter = OpenAiCompatibleAdapter::new(config);

    let tasks_desc: Vec<String> = tasks.iter().map(|t| {
        format!("{{id:{},name:\"{}\",ext_id:\"{}\",type:\"{}\"}}",
            t.id, t.name,
            t.external_id.as_deref().unwrap_or(""),
            t.task_type.as_deref().unwrap_or("-"))
    }).collect();

    let prompt = format!(
r#"分析以下{}个任务,找出同一功能/模块的分组(名称中【xxx】开头的通常同组)。
任务:[{}]
直接返回JSON数组,不要输出任何其他文字。每项:group_name(string),task_ids(int数组),suggested_external_prefix(string)"#,
        tasks.len(),
        tasks_desc.join(","),
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = if let Some(handle) = app_handle {
        adapter.chat_completion_stream(&messages, Some(0.3), handle, Some(false))?
    } else {
        adapter.chat_completion(&messages, Some(0.3))?
    };

    let json_str = extract_json_array(&response.content);

    serde_json::from_str::<Vec<TaskGroup>>(&json_str)
        .map_err(|e| format!("Failed to parse task groups: {}. Response: {}", e, response.content))
}

pub fn ai_auto_fill_tasks(
    config: &LlmConfig,
    tasks: &[Task],
    developers: &[Developer],
    app_handle: Option<&tauri::AppHandle>,
) -> Result<Vec<UpdateTaskDto>, String> {
    let adapter = OpenAiCompatibleAdapter::new(config);

    let tasks_desc: Vec<String> = tasks.iter().map(|t| {
        format!("{{id:{},name:\"{}\",type:\"{}\",owner:{},start:\"{}\",end:\"{}\"}}",
            t.id, t.name,
            t.task_type.as_deref().unwrap_or("-"),
            t.owner_id.map(|id| id.to_string()).unwrap_or("null".to_string()),
            t.planned_start.as_deref().unwrap_or(""),
            t.planned_end.as_deref().unwrap_or(""))
    }).collect();

    let devs_desc: Vec<String> = developers.iter().map(|d| {
        format!("{{id:{},name:\"{}\",roles:{:?},skills:{:?}}}",
            d.id, d.name, d.roles, d.skills)
    }).collect();

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let prompt = format!(
r#"为以下{}个未分配任务自动填充人员和日期。
任务:[{}]
人员:[{}]
今天:{}
规则:按技能匹配,日期从今天排起,不冲突。
直接返回JSON数组,不要输出任何其他文字。每项:id(int),owner_id(int),planned_start(YYYY-MM-DD),planned_end(YYYY-MM-DD)"#,
        tasks.len(),
        tasks_desc.join(","),
        devs_desc.join(","),
        today,
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = if let Some(handle) = app_handle {
        adapter.chat_completion_stream(&messages, Some(0.3), handle, Some(false))?
    } else {
        adapter.chat_completion(&messages, Some(0.3))?
    };

    let json_str = extract_json_array(&response.content);

    serde_json::from_str::<Vec<UpdateTaskDto>>(&json_str)
        .map_err(|e| format!("Failed to parse auto-fill results: {}. Response: {}", e, response.content))
}

fn extract_json_array(content: &str) -> String {
    // Try to extract JSON array from markdown code blocks or raw content
    let trimmed = content.trim();

    // Check for ```json ... ``` block
    if let Some(start) = trimmed.find("```json") {
        if let Some(end) = trimmed[start + 7..].find("```") {
            return trimmed[start + 7..start + 7 + end].trim().to_string();
        }
    }

    // Check for ``` ... ``` block
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        if let Some(end) = after.find("```") {
            let inner = after[..end].trim();
            // Skip language identifier line if present
            if let Some(nl) = inner.find('\n') {
                let first_line = &inner[..nl].trim();
                if !first_line.starts_with('[') && !first_line.starts_with('{') {
                    return inner[nl + 1..].trim().to_string();
                }
            }
            return inner.to_string();
        }
    }

    // Try to find raw JSON array
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            return trimmed[start..=end].to_string();
        }
    }

    trimmed.to_string()
}
