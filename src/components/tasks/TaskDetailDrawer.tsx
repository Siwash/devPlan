import React, { useEffect } from 'react';
import { Drawer, Form, Input, Select, DatePicker, InputNumber, Button, Tag, Space, Spin, message } from 'antd';
import { useTaskDetailStore } from '../../stores/taskDetailStore';
import { useTaskStore } from '../../stores/taskStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { taskApi } from '../../lib/api';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES, STATUS_COLORS } from '../../lib/types';
import type { Task } from '../../lib/types';
import dayjs from 'dayjs';

export const TaskDetailDrawer: React.FC = () => {
  const { open, taskId, closeTaskDetail } = useTaskDetailStore();
  const { updateTask, fetchTasks } = useTaskStore();
  const { developers } = useDeveloperStore();
  const { sprints } = useSprintStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [task, setTask] = React.useState<Task | null>(null);

  useEffect(() => {
    if (open && taskId) {
      setLoading(true);
      taskApi.get(taskId).then((t) => {
        setTask(t ?? null);
        if (t) {
          form.setFieldsValue({
            ...t,
            planned_start: t.planned_start ? dayjs(t.planned_start) : undefined,
            planned_end: t.planned_end ? dayjs(t.planned_end) : undefined,
          });
        }
      }).catch(() => {
        message.error('加载任务详情失败');
      }).finally(() => {
        setLoading(false);
      });
    } else {
      setTask(null);
      form.resetFields();
    }
  }, [open, taskId]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const dto = {
        id: taskId!,
        ...values,
        planned_start: values.planned_start?.format('YYYY-MM-DD'),
        planned_end: values.planned_end?.format('YYYY-MM-DD'),
      };
      await updateTask(dto);
      message.success('任务已更新');
      closeTaskDetail();
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error('保存失败: ' + String(e));
    }
  };

  const drawerTitle = (
    <Space>
      {task?.external_id && <span style={{ color: '#999', fontSize: 13 }}>{task.external_id}</span>}
      {task?.status && <Tag color={STATUS_COLORS[task.status] || '#d9d9d9'}>{task.status}</Tag>}
      <span>任务详情</span>
    </Space>
  );

  return (
    <Drawer
      title={drawerTitle}
      open={open}
      onClose={closeTaskDetail}
      width={520}
      placement="right"
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={closeTaskDetail}>取消</Button>
          <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="external_id" label="编号">
              <Input placeholder="如 JIRA 编号" />
            </Form.Item>
            <Form.Item name="task_type" label="任务类型">
              <Select placeholder="选择类型" allowClear options={TASK_TYPES.map(t => ({ label: t, value: t }))} />
            </Form.Item>
          </div>

          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="输入任务名称" />
          </Form.Item>

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
            <Form.Item name="planned_start" label="计划开始">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="planned_end" label="计划结束">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="parent_number" label="父任务编号">
              <Input placeholder="父任务编号" />
            </Form.Item>
            <Form.Item name="parent_name" label="父任务名称">
              <Input placeholder="父任务名称" />
            </Form.Item>
          </div>
        </Form>
      )}
    </Drawer>
  );
};
