use tauri::State;
use crate::db::AppDatabase;
use crate::db::{task_repo, developer_repo, sprint_repo};
use crate::llm::adapter::{ChatMessage, ChatAction, LlmChatResponse, TaskGroup, ScheduleSuggestion};
use crate::llm::openai_adapter::OpenAiCompatibleAdapter;
use crate::models::task::{UpdateTaskDto, TaskFilter};
use crate::services::{settings_service, llm_service};

#[tauri::command]
pub fn llm_chat(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    user_message: String,
    history: Vec<ChatMessage>,
) -> Result<LlmChatResponse, String> {
    // Scoped DB lock — read all needed data then release
    let (config, developers, sprints, task_count, tasks, hours_per_day) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置，请先在设置中填写 API Key")?;
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        let sprints = sprint_repo::get_all_sprints(&conn).map_err(|e| e.to_string())?;
        let task_count = task_repo::count_tasks(&conn).map_err(|e| e.to_string())?;
        let tasks = task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let hours_per_day = settings_service::get_setting(&conn, "work_hours.hours_per_day")
            .ok().flatten().and_then(|v| v.parse::<f64>().ok()).unwrap_or(8.0);
        (config, developers, sprints, task_count, tasks, hours_per_day)
    }; // DB lock released here

    llm_service::chat_with_context_stream(
        &config, &user_message, &history, &app_handle,
        &developers, &sprints, task_count, &tasks, hours_per_day,
    )
}

#[tauri::command]
pub fn llm_execute_action(
    db: State<AppDatabase>,
    action: ChatAction,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
    let sprints = sprint_repo::get_all_sprints(&conn).map_err(|e| e.to_string())?;
    llm_service::execute_chat_action(&conn, &action, &developers, &sprints)
}

#[tauri::command]
pub fn llm_smart_schedule(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
    sprint_id: Option<i64>,
) -> Result<Vec<ScheduleSuggestion>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks, developers) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置")?;
        let all_tasks = task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks.into_iter().filter(|t| task_ids.contains(&t.id)).collect();
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        (config, tasks, developers)
    }; // DB lock released here

    llm_service::ai_smart_schedule(&config, &tasks, &developers, Some(&app_handle))
}

#[tauri::command]
pub fn llm_identify_similar_tasks(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
) -> Result<Vec<TaskGroup>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置")?;
        let all_tasks = task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks.into_iter().filter(|t| task_ids.contains(&t.id)).collect();
        (config, tasks)
    }; // DB lock released here

    llm_service::ai_identify_similar_tasks(&config, &tasks, Some(&app_handle))
}

#[tauri::command]
pub fn llm_auto_fill_tasks(
    app_handle: tauri::AppHandle,
    db: State<AppDatabase>,
    task_ids: Vec<i64>,
) -> Result<Vec<UpdateTaskDto>, String> {
    // Scoped DB lock — read all needed data then release
    let (config, tasks, developers) = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let config = settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置")?;
        let all_tasks = task_repo::get_all(&conn, &TaskFilter::default()).map_err(|e| e.to_string())?;
        let tasks: Vec<_> = all_tasks.into_iter().filter(|t| task_ids.contains(&t.id)).collect();
        let developers = developer_repo::get_all(&conn).map_err(|e| e.to_string())?;
        (config, tasks, developers)
    }; // DB lock released here

    llm_service::ai_auto_fill_tasks(&config, &tasks, &developers, Some(&app_handle))
}

#[tauri::command]
pub fn llm_test_connection(db: State<AppDatabase>) -> Result<String, String> {
    // Scoped DB lock — only read config
    let config = {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        settings_service::get_llm_config(&conn)?
            .ok_or("LLM 未配置，请先在设置中填写 API Key")?
    }; // DB lock released here

    let adapter = OpenAiCompatibleAdapter::new(&config);
    adapter.chat_completion(
        &[ChatMessage { role: "user".to_string(), content: "Hello".to_string() }],
        None,
    )?;
    Ok("连接成功".to_string())
}
