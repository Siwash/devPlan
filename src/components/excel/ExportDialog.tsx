import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, Input, message, Typography, Alert } from 'antd';
import { save } from '@tauri-apps/plugin-dialog';
import { excelApi } from '../../lib/api';
import { useSprintStore } from '../../stores/sprintStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../../lib/types';
import type { TaskFilter } from '../../lib/types';

const { Text } = Typography;

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  initialFilter?: TaskFilter;
  defaultSprintName?: string;
  mergedTaskCount?: number;
}

const sanitizeNamePart = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '').trim();

const buildDefaultExportFileName = (sprintName: string, mergedTaskCount: number) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const date = `${y}${m}${d}`;
  const safeSprint = sanitizeNamePart(sprintName || '全部迭代') || '全部迭代';
  return `所属迭代${safeSprint}任务甘特图合并开发任务${mergedTaskCount}_${date}.xlsx`;
};

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  initialFilter,
  defaultSprintName = '全部迭代',
  mergedTaskCount = 0,
}) => {
  const [form] = Form.useForm();
  const [exporting, setExporting] = useState(false);
  const { sprints, fetchSprints } = useSprintStore();
  const { developers, fetchDevelopers } = useDeveloperStore();

  useEffect(() => {
    if (open) {
      fetchSprints();
      fetchDevelopers();
      form.setFieldsValue({
        sprint_id: initialFilter?.sprint_id,
        owner_id: initialFilter?.owner_id,
        status: initialFilter?.status,
        task_type: initialFilter?.task_type,
        priority: initialFilter?.priority,
        search: initialFilter?.search,
      });
    }
  }, [open, initialFilter, form]);

  const handleExport = async () => {
    try {
      const values = await form.validateFields();
      const selectedSprintName = values.sprint_id
        ? (sprints.find((s) => s.id === values.sprint_id)?.name || `迭代${values.sprint_id}`)
        : defaultSprintName;
      const defaultPath = buildDefaultExportFileName(selectedSprintName, mergedTaskCount);
      const filePath = await save({
        defaultPath,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });

      if (!filePath) return;

      setExporting(true);
      const filter: TaskFilter = {};
      if (values.sprint_id) filter.sprint_id = values.sprint_id;
      if (values.owner_id) filter.owner_id = values.owner_id;
      if (values.status) filter.status = values.status;
      if (values.task_type) filter.task_type = values.task_type;
      if (values.priority) filter.priority = values.priority;
      if (values.search) filter.search = values.search;

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

  return (
    <Modal
      title="导出 Excel"
      open={open}
      onOk={handleExport}
      onCancel={onClose}
      confirmLoading={exporting}
      okText="选择位置并导出"
      cancelText="取消"
      destroyOnClose
    >
      <Alert
        message="默认已带入任务列表当前查询条件，可按需调整后导出。留空则导出全部任务。"
        type="info"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
        <Form.Item name="search" label="搜索关键词">
          <Input allowClear placeholder="名称 / 描述 / 编号" />
        </Form.Item>
        <Form.Item name="sprint_id" label="迭代">
          <Select
            allowClear
            placeholder="全部迭代"
            options={sprints.map(s => ({ label: s.name, value: s.id }))}
          />
        </Form.Item>
        <Form.Item name="owner_id" label="负责人">
          <Select
            allowClear
            placeholder="全部成员"
            options={developers.map(d => ({ label: d.name, value: d.id }))}
          />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            placeholder="全部状态"
            options={TASK_STATUSES.map(s => ({ label: s, value: s }))}
          />
        </Form.Item>
        <Form.Item name="task_type" label="任务类型">
          <Select
            allowClear
            placeholder="全部类型"
            options={TASK_TYPES.map(t => ({ label: t, value: t }))}
          />
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select
            allowClear
            placeholder="全部优先级"
            options={PRIORITIES.map(p => ({ label: p, value: p }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
