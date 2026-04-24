/**
 * 导出对话框 - 支持过滤条件/选中行互斥模式 + 日期范围 by AI.Coding
 */
import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Input, DatePicker, Segmented, Space, message, Typography, Alert } from 'antd';
import { save } from '@tauri-apps/plugin-dialog';
import { excelApi } from '../../lib/api';
import { useSprintStore } from '../../stores/sprintStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../../lib/types';
import type { TaskFilter } from '../../lib/types';
import dayjs from 'dayjs';

const { Text } = Typography;

/** 导出模式 by AI.Coding */
type ExportMode = 'filter' | 'selected';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  initialFilter?: TaskFilter;
  defaultSprintName?: string;
  mergedTaskCount?: number;
  /** 任务列表选中的行 keys by AI.Coding */
  selectedRowKeys?: number[];
  /** 清空选中行的回调 by AI.Coding */
  onClearSelected?: () => void;
}

const sanitizeNamePart = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '').trim();

const buildDefaultExportFileName = (sprintName: string, count: number) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const date = `${y}${m}${d}`;
  const safeSprint = sanitizeNamePart(sprintName || '全部迭代') || '全部迭代';
  return `所属迭代${safeSprint}任务甘特图合并开发任务${count}_${date}.xlsx`;
};

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  initialFilter,
  defaultSprintName = '全部迭代',
  mergedTaskCount = 0,
  selectedRowKeys = [],
  onClearSelected,
}) => {
  const [form] = Form.useForm();
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('filter');
  /** 监听日期字段变化，用于禁用导出按钮 by AI.Coding */
  const watchStartDate = Form.useWatch('start_date', form);
  const watchEndDate = Form.useWatch('end_date', form);
  const { sprints, fetchSprints } = useSprintStore();
  const { developers, fetchDevelopers } = useDeveloperStore();

  useEffect(() => {
    if (open) {
      fetchSprints();
      fetchDevelopers();
      // 重置为过滤模式
      setExportMode('filter');
      form.setFieldsValue({
        sprint_id: initialFilter?.sprint_id,
        owner_id: initialFilter?.owner_id,
        status: initialFilter?.status,
        task_type: initialFilter?.task_type,
        priority: initialFilter?.priority,
        search: initialFilter?.search,
        start_date: initialFilter?.start_date ? dayjs(initialFilter.start_date) : undefined,
        end_date: initialFilter?.end_date ? dayjs(initialFilter.end_date) : undefined,
      });
    }
  }, [open, initialFilter, form]);

  /** 导出模式切换，互斥重置对方参数 by AI.Coding */
  const handleModeChange = (mode: ExportMode) => {
    if (mode === 'filter') {
      // 切回过滤模式时清空选中行
      onClearSelected?.();
    } else {
      // 切到选中模式时重置过滤表单
      form.resetFields();
    }
    setExportMode(mode);
  };

  const handleExport = async () => {
    // 选中行模式校验
    if (exportMode === 'selected' && selectedRowKeys.length === 0) {
      message.warning('请先在任务列表中勾选任务');
      return;
    }

    // 日期范围校验 by AI.Coding
    if (exportMode === 'filter') {
      const startDate = form.getFieldValue('start_date');
      const endDate = form.getFieldValue('end_date');
      if (startDate && endDate && startDate.isAfter(endDate)) {
        message.warning('开始日期不能晚于结束日期');
        return;
      }
    }

    try {
      const values = await form.validateFields();

      let filter: TaskFilter = {};
      let exportCount = mergedTaskCount;
      let selectedSprintName = defaultSprintName;

      if (exportMode === 'selected') {
        // 选中行模式：仅传 task_ids
        filter.task_ids = selectedRowKeys;
        exportCount = selectedRowKeys.length;
      } else {
        // 过滤条件模式
        if (values.sprint_id) {
          filter.sprint_id = values.sprint_id;
          selectedSprintName = sprints.find(s => s.id === values.sprint_id)?.name || `迭代${values.sprint_id}`;
        }
        if (values.owner_id) filter.owner_id = values.owner_id;
        if (values.status) filter.status = values.status;
        if (values.task_type) filter.task_type = values.task_type;
        if (values.priority) filter.priority = values.priority;
        if (values.search) filter.search = values.search;
        // 日期范围（支持单侧）by AI.Coding
        if (values.start_date) filter.start_date = values.start_date.format('YYYY-MM-DD');
        if (values.end_date) filter.end_date = values.end_date.format('YYYY-MM-DD');
      }

      const defaultPath = buildDefaultExportFileName(selectedSprintName, exportCount);
      const filePath = await save({
        defaultPath,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });

      if (!filePath) return;

      setExporting(true);
      await excelApi.export(filePath, filter);
      onClose();
      Modal.confirm({
        title: '导出成功',
        content: `已导出文件：${filePath}`,
        okText: '查看',
        cancelText: '关闭',
        onOk: async () => {
          try {
            await excelApi.revealInFolder(filePath);
          } catch (err) {
            message.error('打开文件位置失败: ' + String(err));
          }
        },
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error('导出失败: ' + String(e));
    } finally {
      setExporting(false);
    }
  };

  /** 过滤条件区域是否禁用 by AI.Coding */
  const isFilterDisabled = exportMode === 'selected';

  return (
    <Modal
      title="导出 Excel"
      open={open}
      onOk={handleExport}
      onCancel={onClose}
      confirmLoading={exporting}
      okText="选择位置并导出"
      cancelText="取消"
      okButtonProps={{ disabled: (exportMode === 'selected' && selectedRowKeys.length === 0) || (exportMode === 'filter' && !!watchStartDate && !!watchEndDate && watchStartDate.isAfter(watchEndDate)) }}
      destroyOnClose
    >
      {/* 导出模式切换 by AI.Coding */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          options={[
            { label: '按过滤条件', value: 'filter' },
            { label: `按选中行${selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length}条)` : ''}`, value: 'selected' },
          ]}
          value={exportMode}
          onChange={handleModeChange as (value: string) => void}
          block
        />
      </div>

      {exportMode === 'selected' && (
        <Alert
          message={selectedRowKeys.length > 0
            ? `将导出 ${selectedRowKeys.length} 条选中任务`
            : '未选中任何任务，请先在任务列表中勾选'}
          type={selectedRowKeys.length > 0 ? 'info' : 'warning'}
          style={{ marginBottom: 16 }}
        />
      )}

      {exportMode === 'filter' && (
        <Alert
          message="默认已带入任务列表当前查询条件，可按需调整后导出。留空则导出全部任务。"
          type="info"
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item name="search" label="搜索关键词">
          <Input allowClear placeholder="名称 / 描述 / 编号" disabled={isFilterDisabled} />
        </Form.Item>
        <Form.Item name="sprint_id" label="迭代">
          <Select
            allowClear
            placeholder="全部迭代"
            options={sprints.map(s => ({ label: s.name, value: s.id }))}
            disabled={isFilterDisabled}
          />
        </Form.Item>
        <Form.Item name="owner_id" label="负责人">
          <Select
            allowClear
            placeholder="全部成员"
            options={developers.map(d => ({ label: d.name, value: d.id }))}
            disabled={isFilterDisabled}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            placeholder="全部状态"
            options={TASK_STATUSES.map(s => ({ label: s, value: s }))}
            disabled={isFilterDisabled}
          />
        </Form.Item>
        <Form.Item name="task_type" label="任务类型">
          <Select
            allowClear
            placeholder="全部类型"
            options={TASK_TYPES.map(t => ({ label: t, value: t }))}
            disabled={isFilterDisabled}
          />
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select
            allowClear
            placeholder="全部优先级"
            options={PRIORITIES.map(p => ({ label: p, value: p }))}
            disabled={isFilterDisabled}
          />
        </Form.Item>
        {/* 日期范围筛选（支持单侧选择）by AI.Coding */}
        <Form.Item label="日期范围">
          <Space>
            <Form.Item name="start_date" noStyle>
              <DatePicker placeholder="开始日期" disabled={isFilterDisabled} />
            </Form.Item>
            <Form.Item name="end_date" noStyle>
              <DatePicker placeholder="结束日期" disabled={isFilterDisabled} />
            </Form.Item>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};
