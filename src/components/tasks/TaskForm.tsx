import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, InputNumber, message } from 'antd';
import { useTaskStore } from '../../stores/taskStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../../lib/types';
import type { Task } from '../../lib/types';
import dayjs from 'dayjs';

interface TaskFormProps {
  visible: boolean;
  task: Task | null;
  onClose: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ visible, task, onClose }) => {
  const [form] = Form.useForm();
  const { createTask, updateTask } = useTaskStore();
  const { developers } = useDeveloperStore();
  const { sprints } = useSprintStore();

  useEffect(() => {
    if (visible) {
      if (task) {
        form.setFieldsValue({
          ...task,
          planned_start: task.planned_start ? dayjs(task.planned_start) : undefined,
          planned_end: task.planned_end ? dayjs(task.planned_end) : undefined,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: '待开始' });
      }
    }
  }, [visible, task]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const dto = {
        ...values,
        planned_start: values.planned_start?.format('YYYY-MM-DD'),
        planned_end: values.planned_end?.format('YYYY-MM-DD'),
      };

      if (task) {
        await updateTask({ id: task.id, ...dto });
        message.success('任务已更新');
      } else {
        await createTask(dto);
        message.success('任务已创建');
      }
      onClose();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error('操作失败: ' + String(e));
    }
  };

  return (
    <Modal
      title={task ? '编辑任务' : '新建任务'}
      open={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
          <Input placeholder="输入任务名称" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="task_type" label="任务类型">
            <Select placeholder="选择类型" allowClear options={TASK_TYPES.map(t => ({ label: t, value: t }))} />
          </Form.Item>
          <Form.Item name="external_id" label="外部编号">
            <Input placeholder="如 JIRA 编号" />
          </Form.Item>
        </div>

        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="任务描述" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="owner_id" label="负责人">
            <Select placeholder="选择负责人" allowClear showSearch optionFilterProp="label"
              options={developers.map(d => ({ label: d.name, value: d.id }))} />
          </Form.Item>
          <Form.Item name="sprint_id" label="迭代">
            <Select placeholder="选择迭代" allowClear
              options={sprints.map(s => ({ label: s.name, value: s.id }))} />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Form.Item name="priority" label="优先级">
            <Select placeholder="优先级" allowClear options={PRIORITIES.map(p => ({ label: p, value: p }))} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select placeholder="状态" options={TASK_STATUSES.map(s => ({ label: s, value: s }))} />
          </Form.Item>
          <Form.Item name="planned_hours" label="计划工时(h)">
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="planned_start" label="计划开始日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="planned_end" label="计划结束日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};
