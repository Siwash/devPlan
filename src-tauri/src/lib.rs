mod models;
mod db;
mod services;
mod commands;
mod excel;
mod llm;

use db::AppDatabase;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize database
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let database = AppDatabase::initialize(&app_dir)
                .expect("Failed to initialize database");
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Task commands
            commands::task_commands::list_tasks,
            commands::task_commands::get_task,
            commands::task_commands::create_task,
            commands::task_commands::update_task,
            commands::task_commands::delete_task,
            commands::task_commands::count_tasks,
            // Developer commands
            commands::developer_commands::list_developers,
            commands::developer_commands::get_developer,
            commands::developer_commands::create_developer,
            commands::developer_commands::update_developer,
            commands::developer_commands::delete_developer,
            // Sprint commands
            commands::sprint_commands::list_sprints,
            commands::sprint_commands::create_sprint,
            commands::sprint_commands::delete_sprint,
            commands::sprint_commands::list_projects,
            commands::sprint_commands::create_project,
            // Calendar commands
            commands::calendar_commands::get_calendar_events,
            commands::calendar_commands::get_calendar_resources,
            commands::calendar_commands::get_developer_workload,
            commands::calendar_commands::sync_holidays,
            // Excel commands
            commands::excel_commands::analyze_excel,
            commands::excel_commands::score_excel_sheets,
            commands::excel_commands::match_excel_columns,
            commands::excel_commands::preview_excel_import,
            commands::excel_commands::import_excel,
            commands::excel_commands::export_excel,
            commands::excel_commands::get_import_history,
            // Settings commands
            commands::settings_commands::get_llm_config,
            commands::settings_commands::save_llm_config,
            commands::settings_commands::get_excel_template_config,
            commands::settings_commands::save_excel_template_config,
            commands::settings_commands::get_setting,
            commands::settings_commands::save_setting,
            // Batch commands
            commands::batch_commands::batch_update_tasks,
            commands::batch_commands::batch_delete_tasks,
            commands::batch_commands::batch_create_tasks,
            // LLM commands
            commands::llm_commands::llm_chat,
            commands::llm_commands::llm_execute_action,
            commands::llm_commands::llm_smart_schedule,
            commands::llm_commands::llm_identify_similar_tasks,
            commands::llm_commands::llm_auto_fill_tasks,
            commands::llm_commands::llm_test_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
