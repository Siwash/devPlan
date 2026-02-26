use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDefinition {
    pub field: String,
    pub label: String,
    pub keywords_cn: Vec<String>,
    pub keywords_en: Vec<String>,
    pub data_type: ColumnDataType,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ColumnDataType {
    Text,
    Number,
    Date,
    Enum(Vec<String>),
}

pub fn get_task_column_definitions() -> Vec<ColumnDefinition> {
    vec![
        ColumnDefinition {
            field: "task_type".into(),
            label: "任务类型".into(),
            keywords_cn: vec!["类型".into(), "任务类型".into(), "工作类型".into(), "活动类型".into()],
            keywords_en: vec!["type".into(), "task_type".into(), "tasktype".into(), "activity".into()],
            data_type: ColumnDataType::Enum(vec![
                "需求澄清".into(), "技术预研".into(), "产品设计".into(), "UE设计".into(),
                "架构设计".into(), "详细设计".into(), "代码开发".into(), "代码检查".into(),
                "演示".into(), "用例设计".into(), "测试执行".into(), "应用检查".into(), "JIRA BUG".into(),
            ]),
            required: false,
        },
        ColumnDefinition {
            field: "external_id".into(),
            label: "编号".into(),
            keywords_cn: vec!["编号".into(), "任务编号".into(), "ID".into(), "序号".into(), "工作项编号".into()],
            keywords_en: vec!["id".into(), "number".into(), "no".into(), "code".into(), "external_id".into()],
            data_type: ColumnDataType::Text,
            required: false,
        },
        ColumnDefinition {
            field: "name".into(),
            label: "名称".into(),
            keywords_cn: vec!["名称".into(), "任务名称".into(), "标题".into(), "任务名".into(), "工作项名称".into()],
            keywords_en: vec!["name".into(), "title".into(), "subject".into(), "task_name".into()],
            data_type: ColumnDataType::Text,
            required: true,
        },
        ColumnDefinition {
            field: "description".into(),
            label: "描述".into(),
            keywords_cn: vec!["描述".into(), "说明".into(), "详细描述".into(), "备注".into()],
            keywords_en: vec!["description".into(), "desc".into(), "detail".into(), "remark".into(), "note".into()],
            data_type: ColumnDataType::Text,
            required: false,
        },
        ColumnDefinition {
            field: "owner".into(),
            label: "负责人".into(),
            keywords_cn: vec!["负责人".into(), "责任人".into(), "处理人".into(), "指派给".into(), "开发人员".into(), "执行人".into()],
            keywords_en: vec!["owner".into(), "assignee".into(), "developer".into(), "responsible".into(), "assigned".into()],
            data_type: ColumnDataType::Text,
            required: false,
        },
        ColumnDefinition {
            field: "sprint".into(),
            label: "迭代".into(),
            keywords_cn: vec!["迭代".into(), "冲刺".into(), "版本".into(), "里程碑".into()],
            keywords_en: vec!["sprint".into(), "iteration".into(), "version".into(), "milestone".into(), "release".into()],
            data_type: ColumnDataType::Text,
            required: false,
        },
        ColumnDefinition {
            field: "priority".into(),
            label: "优先级".into(),
            keywords_cn: vec!["优先级".into(), "紧急程度".into(), "重要性".into()],
            keywords_en: vec!["priority".into(), "urgency".into(), "importance".into()],
            data_type: ColumnDataType::Enum(vec!["P0".into(), "P1".into(), "P2".into()]),
            required: false,
        },
        ColumnDefinition {
            field: "planned_start".into(),
            label: "计划开始".into(),
            keywords_cn: vec!["计划开始".into(), "开始日期".into(), "开始时间".into(), "起始日期".into(), "计划开始日期".into()],
            keywords_en: vec!["start".into(), "start_date".into(), "begin".into(), "planned_start".into(), "from".into()],
            data_type: ColumnDataType::Date,
            required: false,
        },
        ColumnDefinition {
            field: "planned_end".into(),
            label: "计划结束".into(),
            keywords_cn: vec!["计划结束".into(), "结束日期".into(), "结束时间".into(), "截止日期".into(), "计划结束日期".into(), "计划完成日期".into()],
            keywords_en: vec!["end".into(), "end_date".into(), "finish".into(), "planned_end".into(), "due".into(), "deadline".into()],
            data_type: ColumnDataType::Date,
            required: false,
        },
        ColumnDefinition {
            field: "planned_hours".into(),
            label: "计划工时".into(),
            keywords_cn: vec!["工时".into(), "计划工时".into(), "预估工时".into(), "人时".into(), "人天".into(), "工作量".into()],
            keywords_en: vec!["hours".into(), "effort".into(), "estimate".into(), "workload".into(), "man_hours".into()],
            data_type: ColumnDataType::Number,
            required: false,
        },
        ColumnDefinition {
            field: "status".into(),
            label: "状态".into(),
            keywords_cn: vec!["状态".into(), "任务状态".into(), "进度".into()],
            keywords_en: vec!["status".into(), "state".into(), "progress".into()],
            data_type: ColumnDataType::Enum(vec![
                "待开始".into(), "进行中".into(), "已完成".into(), "暂停中".into(), "已取消".into(),
            ]),
            required: false,
        },
    ]
}
