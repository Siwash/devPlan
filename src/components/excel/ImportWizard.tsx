import React, { useState } from 'react';
import { Steps, Button, Space, Upload, Table, Select, Alert, Progress, Typography, Card, Tag, Radio, Spin, message, Result } from 'antd';
import { UploadOutlined, FileExcelOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { excelApi } from '../../lib/api';
import type { SheetScore, ColumnMatch, ImportResult, ImportConflict } from '../../lib/types';

const { Title, Text } = Typography;

export const ImportWizard: React.FC = () => {
  const [current, setCurrent] = useState(0);
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheetScores, setSheetScores] = useState<SheetScore[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columnMatches, setColumnMatches] = useState<ColumnMatch[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
  const [conflictMode, setConflictMode] = useState<string>('create_new');
  const [detectingConflicts, setDetectingConflicts] = useState(false);

  const TASK_FIELDS = [
    { value: 'task_type', label: '任务类型' },
    { value: 'external_id', label: '编号' },
    { value: 'name', label: '名称' },
    { value: 'description', label: '描述' },
    { value: 'owner', label: '负责人' },
    { value: 'sprint', label: '迭代' },
    { value: 'priority', label: '优先级' },
    { value: 'planned_start', label: '计划开始' },
    { value: 'planned_end', label: '计划结束' },
    { value: 'planned_hours', label: '计划工时' },
    { value: 'status', label: '状态' },
  ];

  // Step 1: Select file
  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      });
      if (selected) {
        const path = selected as string;
        setFilePath(path);
        setFileName(path.split(/[\\/]/).pop() || path);

        const scores = await excelApi.scoreSheets(path);
        setSheetScores(scores);

        if (scores.length > 0) {
          setSelectedSheet(scores[0].sheet_name);
        }
        setCurrent(1);
      }
    } catch (e) {
      message.error('选择文件失败: ' + String(e));
    }
  };

  // Step 2: Select sheet -> Step 3
  const handleSheetConfirm = async () => {
    setAnalyzing(true);
    try {
      const matches = await excelApi.matchColumns(filePath, selectedSheet);
      setColumnMatches(matches);

      const mapping: Record<string, string> = {};
      matches.forEach(m => {
        if (m.matched_field) {
          mapping[m.matched_field] = m.header;
        }
      });
      setColumnMapping(mapping);

      const [headers, rows] = await excelApi.preview(filePath, selectedSheet, 20);
      setPreviewHeaders(headers);
      setPreviewRows(rows);

      setCurrent(2);
    } catch (e) {
      message.error('分析失败: ' + String(e));
    } finally {
      setAnalyzing(false);
    }
  };

  // Step 3: Confirm mapping -> Step 4 (Preview)
  const handleMappingConfirm = () => {
    setCurrent(3);
  };

  // Step 4: Preview -> Step 5 (Conflict Detection)
  const handlePreviewConfirm = async () => {
    setDetectingConflicts(true);
    setConflicts([]);
    setConflictMode('create_new');
    try {
      const detected = await excelApi.detectConflicts(filePath, selectedSheet, columnMapping);
      setConflicts(detected);
      setCurrent(4);
    } catch (e) {
      message.error('冲突检测失败: ' + String(e));
    } finally {
      setDetectingConflicts(false);
    }
  };

  // Step 5: Import
  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await excelApi.import(filePath, selectedSheet, columnMapping, conflictMode);
      setImportResult(result);
      setCurrent(5);
      const parts: string[] = [];
      if (result.rows_imported > 0) parts.push(`新增 ${result.rows_imported} 条`);
      if (result.rows_updated > 0) parts.push(`更新 ${result.rows_updated} 条`);
      if (result.rows_skipped > 0) parts.push(`跳过 ${result.rows_skipped} 条`);
      message.success(`导入完成: ${parts.join(', ')}`);
    } catch (e) {
      message.error('导入失败: ' + String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleColumnMappingChange = (field: string | undefined, header: string | undefined) => {
    const newMapping = { ...columnMapping };
    // Remove old mapping for this header
    if (header) {
      Object.keys(newMapping).forEach(k => {
        if (newMapping[k] === header) delete newMapping[k];
      });
    }
    if (field && header) {
      newMapping[field] = header;
    }
    setColumnMapping(newMapping);
  };

  const conflictColumns = [
    {
      title: '行号',
      dataIndex: 'row_index',
      width: 70,
      render: (v: number) => v + 1,
    },
    {
      title: '导入名称',
      dataIndex: 'import_name',
      ellipsis: true,
    },
    {
      title: '导入编号',
      dataIndex: 'import_external_id',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '已有任务名称',
      dataIndex: 'existing_name',
      ellipsis: true,
    },
    {
      title: '已有编号',
      dataIndex: 'existing_external_id',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '匹配方式',
      dataIndex: 'match_type',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'external_id' ? 'blue' : 'orange'}>
          {v === 'external_id' ? '编号匹配' : '名称匹配'}
        </Tag>
      ),
    },
  ];

  const steps = [
    { title: '选择文件' },
    { title: 'Sheet匹配' },
    { title: '列映射' },
    { title: '预览数据' },
    { title: '冲突检测' },
    { title: '完成' },
  ];

  return (
    <div>
      <Title level={4}>Excel 导入向导</Title>
      <Steps current={current} items={steps} style={{ marginBottom: 24 }} />

      {/* Step 0: Select File */}
      {current === 0 && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <FileExcelOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 16 }} />
          <div style={{ marginBottom: 16 }}>
            <Text>选择 Excel 文件 (.xlsx) 开始导入</Text>
          </div>
          <Button type="primary" size="large" icon={<UploadOutlined />} onClick={handleSelectFile}>
            选择 Excel 文件
          </Button>
        </Card>
      )}

      {/* Step 1: Sheet Selection */}
      {current === 1 && (
        <div>
          <Alert message={`已选择文件: ${fileName}`} type="info" style={{ marginBottom: 16 }} />
          <Title level={5}>智能 Sheet 匹配结果</Title>
          <Table
            dataSource={sheetScores}
            rowKey="sheet_name"
            pagination={false}
            scroll={{ y: 300 }}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: [selectedSheet],
              onChange: (keys) => setSelectedSheet(keys[0] as string),
            }}
            columns={[
              { title: 'Sheet 名称', dataIndex: 'sheet_name' },
              {
                title: '匹配度',
                dataIndex: 'score',
                render: (v: number) => (
                  <Progress percent={Math.round(v * 100)} size="small" status={v > 0.5 ? 'success' : 'normal'} />
                ),
              },
              {
                title: '匹配原因',
                dataIndex: 'reasons',
                render: (reasons: string[]) => reasons.map((r, i) => <Tag key={i}>{r}</Tag>),
              },
            ]}
          />
          <div style={{ marginTop: 16, textAlign: 'right', padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              <Button type="primary" loading={analyzing} onClick={handleSheetConfirm} disabled={!selectedSheet}>
                下一步: 列映射
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {current === 2 && (
        <div>
          <Title level={5}>智能列映射</Title>
          <Alert message="系统已自动匹配列，您可以手动调整映射关系。未匹配的列将被忽略。" type="info" style={{ marginBottom: 16 }} />
          <Table
            dataSource={columnMatches}
            rowKey="header_index"
            pagination={false}
            size="small"
            scroll={{ y: 400 }}
            columns={[
              { title: 'Excel列头', dataIndex: 'header', width: 150 },
              {
                title: '匹配字段',
                width: 150,
                render: (_: unknown, record: ColumnMatch) => (
                  <Select
                    style={{ width: '100%' }}
                    allowClear
                    placeholder="不导入"
                    value={Object.entries(columnMapping).find(([_, v]) => v === record.header)?.[0]}
                    onChange={(v) => handleColumnMappingChange(v, record.header)}
                    options={TASK_FIELDS}
                  />
                ),
              },
              {
                title: '置信度',
                dataIndex: 'confidence',
                width: 120,
                render: (v: number) => (
                  <Progress
                    percent={Math.round(v * 100)}
                    size="small"
                    status={v >= 0.7 ? 'success' : v >= 0.4 ? 'normal' : 'exception'}
                  />
                ),
              },
              { title: '匹配方法', dataIndex: 'match_method', width: 150 },
            ]}
          />
          <div style={{ marginTop: 16, textAlign: 'right', padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => setCurrent(1)}>上一步</Button>
              <Button type="primary" onClick={handleMappingConfirm}>
                下一步: 预览
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {current === 3 && (
        <div>
          <Title level={5}>数据预览 (前20行)</Title>
          <Table
            dataSource={previewRows.map((row, i) => ({ key: i, ...Object.fromEntries(previewHeaders.map((h, j) => [h, row[j]])) }))}
            columns={previewHeaders.map(h => ({
              title: h,
              dataIndex: h,
              ellipsis: true,
              width: 120,
            }))}
            pagination={false}
            size="small"
            scroll={{ x: previewHeaders.length * 120, y: 400 }}
          />
          <Alert
            message={`映射字段: ${Object.keys(columnMapping).length} 个`}
            description={Object.entries(columnMapping).map(([f, h]) => `${f} <- ${h}`).join(', ')}
            type="info"
            style={{ marginTop: 16, marginBottom: 16 }}
          />
          <div style={{ textAlign: 'right', padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => setCurrent(2)}>上一步</Button>
              <Button type="primary" loading={detectingConflicts} onClick={handlePreviewConfirm}>
                下一步: 冲突检测
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* Step 4: Conflict Detection */}
      {current === 4 && (
        <div>
          <Title level={5}>冲突检测</Title>
          {detectingConflicts ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>正在检测重复数据...</Text>
              </div>
            </div>
          ) : conflicts.length === 0 ? (
            <div>
              <Alert
                message="未检测到重复数据"
                description="Excel 中的所有任务均未在系统中找到匹配的已有任务，可以安全导入。"
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                style={{ marginBottom: 16 }}
              />
            </div>
          ) : (
            <div>
              <Alert
                message={`检测到 ${conflicts.length} 条重复数据`}
                description="以下 Excel 行与系统中已有任务的名称或编号匹配，请选择处理方式。"
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginBottom: 16 }}
              />
              <Table
                dataSource={conflicts}
                rowKey="row_index"
                columns={conflictColumns}
                pagination={false}
                size="small"
                scroll={{ y: 300 }}
                style={{ marginBottom: 16 }}
              />
              <Card size="small" title="冲突处理方式" style={{ marginBottom: 16 }}>
                <Radio.Group
                  value={conflictMode}
                  onChange={(e) => setConflictMode(e.target.value)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <Radio value="create_new">
                    <Text strong>全部创建新任务</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>忽略重复，所有行都创建为新任务</Text>
                  </Radio>
                  <Radio value="update">
                    <Text strong>更新已存在的</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>用 Excel 数据覆盖匹配任务的字段（空值不覆盖），新数据照常创建</Text>
                  </Radio>
                  <Radio value="skip">
                    <Text strong>跳过已存在的</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>仅导入不重复的新数据，已存在的行将被跳过</Text>
                  </Radio>
                </Radio.Group>
              </Card>
            </div>
          )}
          <div style={{ textAlign: 'right', padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
            <Space>
              <Button onClick={() => setCurrent(3)}>上一步</Button>
              <Button type="primary" loading={importing} onClick={handleImport}>
                确认导入
              </Button>
            </Space>
          </div>
        </div>
      )}

      {/* Step 5: Result */}
      {current === 5 && importResult && (
        <Result
          status="success"
          title="导入完成"
          subTitle={
            [
              importResult.rows_imported > 0 ? `新增 ${importResult.rows_imported} 条` : null,
              importResult.rows_updated > 0 ? `更新 ${importResult.rows_updated} 条` : null,
              importResult.rows_skipped > 0 ? `跳过 ${importResult.rows_skipped} 条` : null,
            ].filter(Boolean).join(', ') || '无数据变更'
          }
          extra={
            <div>
              <div style={{ textAlign: 'left', maxWidth: 500, margin: '0 auto', marginBottom: 16 }}>
                {importResult.developers_created.length > 0 && (
                  <Alert
                    message={`自动创建了 ${importResult.developers_created.length} 名开发人员`}
                    description={importResult.developers_created.join(', ')}
                    type="info"
                    style={{ marginBottom: 8 }}
                  />
                )}
                {importResult.errors.length > 0 && (
                  <Alert
                    message={`${importResult.errors.length} 个错误`}
                    description={
                      <div style={{ maxHeight: 120, overflow: 'auto' }}>
                        {importResult.errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
                      </div>
                    }
                    type="warning"
                    style={{ marginBottom: 8 }}
                  />
                )}
              </div>
              <Space>
                <Button onClick={() => { setCurrent(0); setImportResult(null); setConflicts([]); setConflictMode('create_new'); }}>
                  再次导入
                </Button>
                <Button type="primary" onClick={() => window.location.hash = '#/tasks'}>
                  查看任务列表
                </Button>
              </Space>
            </div>
          }
        />
      )}
    </div>
  );
};
