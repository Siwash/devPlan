use serde::{Deserialize, Serialize};
use strsim::jaro_winkler;

use super::column_definitions::{get_task_column_definitions, ColumnDataType};
use super::reader::SheetInfo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetScore {
    pub sheet_name: String,
    pub score: f64,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMatch {
    pub header: String,
    pub header_index: usize,
    pub matched_field: Option<String>,
    pub matched_label: Option<String>,
    pub confidence: f64,
    pub match_method: String,
}

/// Score sheets to find the most likely task sheet
pub fn score_sheets(sheets: &[SheetInfo]) -> Vec<SheetScore> {
    let mut scores: Vec<SheetScore> = sheets.iter().map(|sheet| {
        let mut score = 0.0f64;
        let mut reasons = Vec::new();

        // Signal 1: Sheet name contains task-related keywords (+0.2)
        let name_lower = sheet.name.to_lowercase();
        let task_keywords = ["task", "任务", "计划", "工作项", "排期", "迭代", "sprint", "backlog"];
        for kw in &task_keywords {
            if name_lower.contains(kw) {
                score += 0.2;
                reasons.push(format!("Sheet名包含关键词 '{}'", kw));
                break;
            }
        }

        // Signal 2: Header matching task field patterns (+0.4)
        let definitions = get_task_column_definitions();
        let mut matched_headers = 0;
        for def in &definitions {
            for header in &sheet.headers {
                let h_lower = header.to_lowercase().trim().to_string();
                let is_match = def.keywords_cn.iter().any(|k| h_lower.contains(&k.to_lowercase()))
                    || def.keywords_en.iter().any(|k| h_lower.contains(&k.to_lowercase()));
                if is_match {
                    matched_headers += 1;
                    break;
                }
            }
        }
        let header_ratio = if !definitions.is_empty() {
            matched_headers as f64 / definitions.len() as f64
        } else {
            0.0
        };
        score += header_ratio * 0.4;
        if matched_headers > 0 {
            reasons.push(format!("匹配到 {}/{} 个任务列头", matched_headers, definitions.len()));
        }

        // Signal 3: Data shape analysis (+0.15)
        if sheet.row_count >= 5 && sheet.col_count >= 5 {
            score += 0.15;
            reasons.push(format!("数据规模合理 ({}行×{}列)", sheet.row_count, sheet.col_count));
        }

        // Signal 4: Contains date columns (+0.1)
        let has_dates = sheet.sample_rows.iter().any(|row| {
            row.iter().any(|cell| {
                cell.contains('-') && cell.len() == 10
                    && cell.chars().filter(|c| *c == '-').count() == 2
            })
        });
        if has_dates {
            score += 0.1;
            reasons.push("包含日期数据".into());
        }

        // Signal 5: Cell values match known enums (+0.15)
        let enum_values: Vec<&str> = vec![
            "P0", "P1", "P2",
            "待开始", "进行中", "已完成", "暂停中", "已取消",
            "需求澄清", "技术预研", "代码开发", "测试执行",
        ];
        let has_enums = sheet.sample_rows.iter().any(|row| {
            row.iter().any(|cell| enum_values.iter().any(|ev| cell.trim() == *ev))
        });
        if has_enums {
            score += 0.15;
            reasons.push("包含已知枚举值".into());
        }

        // Penalty: Hidden sheet (-0.3)
        if sheet.is_hidden {
            score -= 0.3;
            reasons.push("隐藏Sheet惩罚".into());
        }

        // Penalty: Summary sheet (-0.2)
        let summary_keywords = ["汇总", "统计", "summary", "总计", "dashboard", "概览"];
        for kw in &summary_keywords {
            if name_lower.contains(kw) {
                score -= 0.2;
                reasons.push(format!("汇总Sheet惩罚 (包含'{}')", kw));
                break;
            }
        }

        SheetScore {
            sheet_name: sheet.name.clone(),
            score: score.max(0.0),
            reasons,
        }
    }).collect();

    scores.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scores
}

/// Match column headers to task fields
pub fn match_columns(headers: &[String], sample_rows: &[Vec<String>]) -> Vec<ColumnMatch> {
    let definitions = get_task_column_definitions();
    let mut matches: Vec<ColumnMatch> = Vec::new();
    let mut used_fields: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (idx, header) in headers.iter().enumerate() {
        let header_trimmed = header.trim().to_string();
        if header_trimmed.is_empty() {
            matches.push(ColumnMatch {
                header: header_trimmed,
                header_index: idx,
                matched_field: None,
                matched_label: None,
                confidence: 0.0,
                match_method: "empty".into(),
            });
            continue;
        }

        let mut best_match: Option<(String, String, f64, String)> = None;

        for def in &definitions {
            if used_fields.contains(&def.field) {
                continue;
            }

            let h_lower = header_trimmed.to_lowercase();

            // Level 1: Exact keyword match (confidence 1.0)
            let exact_cn = def.keywords_cn.iter().any(|k| k.to_lowercase() == h_lower);
            let exact_en = def.keywords_en.iter().any(|k| k.to_lowercase() == h_lower);
            if exact_cn || exact_en {
                best_match = Some((def.field.clone(), def.label.clone(), 1.0, "精确匹配".into()));
                break;
            }

            // Level 2: Substring contains (confidence 0.7)
            let contains_cn = def.keywords_cn.iter().any(|k| h_lower.contains(&k.to_lowercase()) || k.to_lowercase().contains(&h_lower));
            let contains_en = def.keywords_en.iter().any(|k| h_lower.contains(&k.to_lowercase()) || k.to_lowercase().contains(&h_lower));
            if contains_cn || contains_en {
                let conf = 0.7;
                if best_match.as_ref().map(|m| m.2).unwrap_or(0.0) < conf {
                    best_match = Some((def.field.clone(), def.label.clone(), conf, "子串包含".into()));
                }
                continue;
            }

            // Level 3: Chinese word segmentation overlap (confidence 0.5)
            let header_words = jieba_segment(&header_trimmed);
            let keyword_words: Vec<String> = def.keywords_cn.iter()
                .flat_map(|k| jieba_segment(k))
                .collect();
            let overlap = header_words.iter()
                .filter(|w| keyword_words.iter().any(|kw| kw == *w))
                .count();
            if overlap > 0 {
                let conf = 0.5;
                if best_match.as_ref().map(|m| m.2).unwrap_or(0.0) < conf {
                    best_match = Some((def.field.clone(), def.label.clone(), conf, "分词匹配".into()));
                }
                continue;
            }

            // Level 4: Jaro-Winkler similarity (confidence = 0.6 * similarity)
            let max_sim = def.keywords_cn.iter()
                .chain(def.keywords_en.iter())
                .map(|k| jaro_winkler(&h_lower, &k.to_lowercase()) as f64)
                .fold(0.0f64, f64::max);

            if max_sim > 0.7 {
                let conf = 0.6 * max_sim;
                if best_match.as_ref().map(|m| m.2).unwrap_or(0.0) < conf {
                    best_match = Some((def.field.clone(), def.label.clone(), conf, format!("相似度匹配({:.0}%)", max_sim * 100.0)));
                }
            }
        }

        // Data type validation bonus (+0.15)
        if let Some(ref mut m) = best_match {
            if let Some(def) = definitions.iter().find(|d| d.field == m.0) {
                if validate_data_type(&def.data_type, idx, sample_rows) {
                    m.2 = (m.2 + 0.15).min(1.0);
                    m.3 = format!("{} + 数据类型验证", m.3);
                }
            }
        }

        if let Some((field, label, conf, method)) = best_match {
            if conf >= 0.3 {
                used_fields.insert(field.clone());
                matches.push(ColumnMatch {
                    header: header_trimmed,
                    header_index: idx,
                    matched_field: Some(field),
                    matched_label: Some(label),
                    confidence: conf,
                    match_method: method,
                });
            } else {
                matches.push(ColumnMatch {
                    header: header_trimmed,
                    header_index: idx,
                    matched_field: None,
                    matched_label: None,
                    confidence: conf,
                    match_method: "低置信度".into(),
                });
            }
        } else {
            matches.push(ColumnMatch {
                header: header_trimmed,
                header_index: idx,
                matched_field: None,
                matched_label: None,
                confidence: 0.0,
                match_method: "未匹配".into(),
            });
        }
    }

    matches
}

fn jieba_segment(text: &str) -> Vec<String> {
    use jieba_rs::Jieba;
    use once_cell::sync::Lazy;
    static JIEBA: Lazy<Jieba> = Lazy::new(Jieba::new);
    JIEBA.cut(text, false).into_iter().map(|s| s.to_string()).filter(|s| s.len() > 1).collect()
}

fn validate_data_type(data_type: &ColumnDataType, col_idx: usize, sample_rows: &[Vec<String>]) -> bool {
    let values: Vec<&str> = sample_rows.iter()
        .filter_map(|row| row.get(col_idx).map(|s| s.as_str()))
        .filter(|s| !s.is_empty())
        .take(10)
        .collect();

    if values.is_empty() {
        return false;
    }

    match data_type {
        ColumnDataType::Number => {
            let numeric_count = values.iter().filter(|v| v.parse::<f64>().is_ok()).count();
            numeric_count as f64 / values.len() as f64 > 0.5
        }
        ColumnDataType::Date => {
            let date_count = values.iter().filter(|v| {
                v.contains('-') && v.len() >= 8 && v.len() <= 10
            }).count();
            date_count as f64 / values.len() as f64 > 0.5
        }
        ColumnDataType::Enum(allowed) => {
            let match_count = values.iter().filter(|v| {
                allowed.iter().any(|a| a == v.trim())
            }).count();
            match_count as f64 / values.len() as f64 > 0.3
        }
        ColumnDataType::Text => true,
    }
}
