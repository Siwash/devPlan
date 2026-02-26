use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskType {
    #[serde(rename = "需求澄清")]
    RequirementClarification,
    #[serde(rename = "技术预研")]
    TechnicalResearch,
    #[serde(rename = "产品设计")]
    ProductDesign,
    #[serde(rename = "UE设计")]
    UeDesign,
    #[serde(rename = "架构设计")]
    ArchitectureDesign,
    #[serde(rename = "详细设计")]
    DetailedDesign,
    #[serde(rename = "代码开发")]
    CodeDevelopment,
    #[serde(rename = "代码检查")]
    CodeReview,
    #[serde(rename = "演示")]
    Demo,
    #[serde(rename = "用例设计")]
    TestCaseDesign,
    #[serde(rename = "测试执行")]
    TestExecution,
    #[serde(rename = "应用检查")]
    ApplicationCheck,
    #[serde(rename = "JIRA BUG")]
    JiraBug,
}

impl TaskType {
    pub fn all_values() -> Vec<&'static str> {
        vec![
            "需求澄清", "技术预研", "产品设计", "UE设计", "架构设计",
            "详细设计", "代码开发", "代码检查", "演示", "用例设计",
            "测试执行", "应用检查", "JIRA BUG",
        ]
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "需求澄清" => Some(Self::RequirementClarification),
            "技术预研" => Some(Self::TechnicalResearch),
            "产品设计" => Some(Self::ProductDesign),
            "UE设计" => Some(Self::UeDesign),
            "架构设计" => Some(Self::ArchitectureDesign),
            "详细设计" => Some(Self::DetailedDesign),
            "代码开发" => Some(Self::CodeDevelopment),
            "代码检查" => Some(Self::CodeReview),
            "演示" => Some(Self::Demo),
            "用例设计" => Some(Self::TestCaseDesign),
            "测试执行" => Some(Self::TestExecution),
            "应用检查" => Some(Self::ApplicationCheck),
            "JIRA BUG" => Some(Self::JiraBug),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RequirementClarification => "需求澄清",
            Self::TechnicalResearch => "技术预研",
            Self::ProductDesign => "产品设计",
            Self::UeDesign => "UE设计",
            Self::ArchitectureDesign => "架构设计",
            Self::DetailedDesign => "详细设计",
            Self::CodeDevelopment => "代码开发",
            Self::CodeReview => "代码检查",
            Self::Demo => "演示",
            Self::TestCaseDesign => "用例设计",
            Self::TestExecution => "测试执行",
            Self::ApplicationCheck => "应用检查",
            Self::JiraBug => "JIRA BUG",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Priority {
    P0,
    P1,
    P2,
}

impl Priority {
    pub fn all_values() -> Vec<&'static str> {
        vec!["P0", "P1", "P2"]
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "P0" => Some(Self::P0),
            "P1" => Some(Self::P1),
            "P2" => Some(Self::P2),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::P0 => "P0",
            Self::P1 => "P1",
            Self::P2 => "P2",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    #[serde(rename = "待开始")]
    NotStarted,
    #[serde(rename = "进行中")]
    InProgress,
    #[serde(rename = "已完成")]
    Completed,
    #[serde(rename = "暂停中")]
    Paused,
    #[serde(rename = "已取消")]
    Cancelled,
}

impl TaskStatus {
    pub fn all_values() -> Vec<&'static str> {
        vec!["待开始", "进行中", "已完成", "暂停中", "已取消"]
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "待开始" => Some(Self::NotStarted),
            "进行中" => Some(Self::InProgress),
            "已完成" => Some(Self::Completed),
            "暂停中" => Some(Self::Paused),
            "已取消" => Some(Self::Cancelled),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotStarted => "待开始",
            Self::InProgress => "进行中",
            Self::Completed => "已完成",
            Self::Paused => "暂停中",
            Self::Cancelled => "已取消",
        }
    }
}
