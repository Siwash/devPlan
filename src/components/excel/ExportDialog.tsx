import React, { useEffect, useState } from 'react';
import { Modal, Form, Select, message, Typography, Alert } from 'antd';
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
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, onClose }) => {
  const [form] = Form.useForm();
  const [exporting, setExporting] = useState(false);
  const { sprints, fetchSprints } = useSprintStore();
  const { developers, fetchDevelopers } = useDeveloperStore();

  useEffect(() => {
    if (open) {
      fetchSprints();
      fetchDevelopers();
    }
  }, [open]);

  const handleExport = async () => {
    try {
      const values = await form.validateFields();
      const filePath = await save({
        defaultPath: 'devplan_export.xlsx',
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

      await excelApi.export(filePath, filter);
      message.success('导出成功: ' + filePath);
      onClose();
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
        message="选择筛选条件导出任务数据。留空则导出全部任务。"
        type="info"
        style={{ marginBottom: 16 }}
      />
      <Form form={form} layout="vertical">
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
