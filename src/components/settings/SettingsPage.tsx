import React, { useEffect, useState } from 'react';
import { Tabs, Form, Input, InputNumber, Select, Button, Table, Space, message, Popconfirm, Segmented } from 'antd';
import { PlusOutlined, DeleteOutlined, ApiOutlined } from '@ant-design/icons';
import { useSettingsStore } from '../../stores/settingsStore';
import { llmApi } from '../../lib/api';
import type { LlmConfig, ExcelTemplateConfig, TemplateColumn, WorkHoursConfig } from '../../lib/types';

const TASK_FIELDS = [
  { value: 'external_id', label: '编号' },
  { value: 'task_type', label: '类型' },
  { value: 'name', label: '名称' },
  { value: 'description', label: '描述' },
  { value: 'owner_name', label: '负责人' },
  { value: 'sprint_name', label: '迭代' },
  { value: 'priority', label: '优先级' },
  { value: 'planned_start', label: '开始日期' },
  { value: 'planned_end', label: '结束日期' },
  { value: 'planned_hours', label: '工时' },
  { value: 'status', label: '状态' },
  { value: 'parent_task_id', label: '父任务' },
];

const LlmConfigTab: React.FC = () => {
  const [form] = Form.useForm();
  const { llmConfig, saveLlmConfig, fetchLlmConfig, loading } = useSettingsStore();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchLlmConfig();
  }, []);

  useEffect(() => {
    if (llmConfig) {
      form.setFieldsValue({
        ...llmConfig,
        model: llmConfig.model ? [llmConfig.model] : [],
      });
    }
  }, [llmConfig]);

  const extractConfig = (values: any): LlmConfig => {
    const modelArr = values.model as string[] | undefined;
    return { ...values, model: modelArr?.[0] || '' };
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await saveLlmConfig(extractConfig(values));
      message.success('LLM 配置已保存');
    } catch {
      // validation error
    }
  };

  const handleTest = async () => {
    try {
      const values = await form.validateFields();
      await saveLlmConfig(extractConfig(values));
      setTesting(true);
      const result = await llmApi.testConnection();
      message.success(result);
    } catch (e: any) {
      message.error(`连接失败: ${e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
      <Form.Item label="API URL" name="api_url" rules={[{ required: true, message: '请输入 API URL' }]}>
        <Input placeholder="https://api.openai.com/v1" />
      </Form.Item>
      <Form.Item label="API Key" name="api_key" rules={[{ required: true, message: '请输入 API Key' }]}>
        <Input.Password placeholder="sk-..." />
      </Form.Item>
      <Form.Item label="模型" name="model" rules={[{ required: true, message: '请选择或输入模型名称' }]}>
        <Select
          showSearch
          allowClear
          mode="tags"
          maxCount={1}
          placeholder="选择或输入模型名称"
          options={[
            { value: 'gpt-4o', label: 'GPT-4o' },
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
            { value: 'gpt-4.1', label: 'GPT-4.1' },
            { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
            { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
            { value: 'deepseek-chat', label: 'DeepSeek Chat' },
            { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
            { value: 'qwen-plus', label: 'Qwen Plus' },
          ]}
          tokenSeparators={[]}
        />
      </Form.Item>
      <Form.Item label="Max Tokens" name="max_tokens">
        <InputNumber min={100} max={128000} style={{ width: '100%' }} placeholder="4096" />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
          <Button icon={<ApiOutlined />} onClick={handleTest} loading={testing}>测试连接</Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

const DEFAULT_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { excel_header: '编号', mapped_field: 'external_id', column_index: 0 },
  { excel_header: '任务类型', mapped_field: 'task_type', column_index: 1 },
  { excel_header: '任务名称', mapped_field: 'name', column_index: 2 },
  { excel_header: '负责人', mapped_field: 'owner_name', column_index: 3 },
  { excel_header: '所属迭代', mapped_field: 'sprint_name', column_index: 4 },
  { excel_header: '优先级', mapped_field: 'priority', column_index: 5 },
  { excel_header: '计划开始', mapped_field: 'planned_start', column_index: 6 },
  { excel_header: '计划结束', mapped_field: 'planned_end', column_index: 7 },
  { excel_header: '预估工时(h)', mapped_field: 'planned_hours', column_index: 8 },
  { excel_header: '状态', mapped_field: 'status', column_index: 9 },
];

const ExcelTemplateTab: React.FC = () => {
  const { excelTemplateConfig, saveExcelTemplateConfig, fetchExcelTemplateConfig, loading } = useSettingsStore();
  const [columns, setColumns] = useState<TemplateColumn[]>([]);
  const [headerRow, setHeaderRow] = useState<number | undefined>(undefined);
  const [sheetName, setSheetName] = useState<string>('');

  useEffect(() => {
    fetchExcelTemplateConfig();
  }, []);

  useEffect(() => {
    if (excelTemplateConfig && excelTemplateConfig.column_mapping.length > 0) {
      setColumns(excelTemplateConfig.column_mapping);
      setHeaderRow(excelTemplateConfig.header_row ?? undefined);
      setSheetName(excelTemplateConfig.default_sheet_name ?? '');
    } else {
      setColumns(DEFAULT_TEMPLATE_COLUMNS);
      setHeaderRow(0);
      setSheetName('任务清单');
    }
  }, [excelTemplateConfig]);

  const handleSave = async () => {
    const config: ExcelTemplateConfig = {
      column_mapping: columns,
      header_row: headerRow,
      default_sheet_name: sheetName || undefined,
    };
    await saveExcelTemplateConfig(config);
    message.success('Excel 模板配置已保存');
  };

  const addColumn = () => {
    setColumns([...columns, { excel_header: '', mapped_field: '', column_index: undefined }]);
  };

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const updateColumn = (index: number, field: keyof TemplateColumn, value: any) => {
    const newColumns = [...columns];
    newColumns[index] = { ...newColumns[index], [field]: value };
    setColumns(newColumns);
  };

  const tableColumns = [
    {
      title: 'Excel 表头',
      dataIndex: 'excel_header',
      render: (_: any, __: any, index: number) => (
        <Input
          value={columns[index]?.excel_header}
          onChange={e => updateColumn(index, 'excel_header', e.target.value)}
          placeholder="列名"
          size="small"
        />
      ),
    },
    {
      title: '映射字段',
      dataIndex: 'mapped_field',
      render: (_: any, __: any, index: number) => (
        <Select
          value={columns[index]?.mapped_field || undefined}
          onChange={v => updateColumn(index, 'mapped_field', v)}
          options={TASK_FIELDS}
          placeholder="选择字段"
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '列序号',
      dataIndex: 'column_index',
      width: 80,
      render: (_: any, __: any, index: number) => (
        <InputNumber
          value={columns[index]?.column_index}
          onChange={v => updateColumn(index, 'column_index', v ?? undefined)}
          min={0}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '操作',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <Popconfirm title="确认删除?" onConfirm={() => removeColumn(index)}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const resetToDefault = () => {
    setColumns(DEFAULT_TEMPLATE_COLUMNS);
    setHeaderRow(0);
    setSheetName('任务清单');
    message.info('已恢复为默认模板');
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <p style={{ color: '#888', marginBottom: 16 }}>
        配置 Excel 导入时列头与系统字段的映射关系。列序号从 0 开始，表示 Excel 中该列的位置。
      </p>
      <Space style={{ marginBottom: 16 }}>
        <span>Header 行号:</span>
        <InputNumber value={headerRow} onChange={v => setHeaderRow(v ?? undefined)} min={0} size="small" />
        <span style={{ marginLeft: 16 }}>默认 Sheet:</span>
        <Input value={sheetName} onChange={e => setSheetName(e.target.value)} placeholder="Sheet 名称" size="small" style={{ width: 150 }} />
      </Space>
      <Table
        dataSource={columns.map((c, i) => ({ ...c, key: i }))}
        columns={tableColumns}
        pagination={false}
        size="small"
        footer={() => (
          <Button type="dashed" onClick={addColumn} block icon={<PlusOutlined />}>
            添加列映射
          </Button>
        )}
      />
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
        <Button onClick={resetToDefault}>恢复默认</Button>
      </Space>
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const items = [
    { key: 'general', label: '通用设置', children: <GeneralSettingsTab /> },
    { key: 'llm', label: 'LLM 配置', children: <LlmConfigTab /> },
    { key: 'excel', label: 'Excel 模板', children: <ExcelTemplateTab /> },
  ];

  return (
    <div>
      <h3 style={{ marginBottom: 16 }}>设置</h3>
      <Tabs items={items} />
    </div>
  );
};

const GeneralSettingsTab: React.FC = () => {
  const { workHoursConfig, fetchWorkHoursConfig, saveWorkHoursConfig } = useSettingsStore();
  const [localConfig, setLocalConfig] = useState<WorkHoursConfig>(workHoursConfig);

  useEffect(() => {
    fetchWorkHoursConfig();
  }, []);

  useEffect(() => {
    setLocalConfig(workHoursConfig);
  }, [workHoursConfig]);

  const handleSave = async () => {
    await saveWorkHoursConfig(localConfig);
    message.success('通用设置已保存');
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>工时显示单位</div>
        <Segmented
          value={localConfig.display_unit}
          onChange={(v) => setLocalConfig({ ...localConfig, display_unit: v as 'day' | 'hour' })}
          options={[
            { label: '天 (d)', value: 'day' },
            { label: '小时 (h)', value: 'hour' },
          ]}
        />
        <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
          数据库始终以小时为单位存储，此处仅控制界面显示
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>每天工时数</div>
        <InputNumber
          value={localConfig.hours_per_day}
          onChange={(v) => setLocalConfig({ ...localConfig, hours_per_day: v ?? 8 })}
          min={1}
          max={24}
          step={0.5}
          style={{ width: 120 }}
          addonAfter="小时/天"
        />
        <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
          用于"天"与"小时"之间的换算 (默认 8 小时 = 1 天)
        </div>
      </div>
      <Button type="primary" onClick={handleSave}>保存</Button>
    </div>
  );
};
