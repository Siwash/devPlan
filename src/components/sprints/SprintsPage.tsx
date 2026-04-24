/**
 * 迭代管理页面 - Sprint CRUD by AI.Coding
 */
import React, { useEffect, useState } from 'react';
import { Button, DatePicker, Input, Modal, Popconfirm, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Sprint, CreateSprintDto, UpdateSprintDto } from '../../lib/types';
import { useSprintStore } from '../../stores/sprintStore';

const { Title, Text } = Typography;

export const SprintsPage: React.FC = () => {
  const { sprints, loading, fetchSprints, createSprint, updateSprint, deleteSprint } = useSprintStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [formName, setFormName] = useState('');
  /** 起始/结束日期独立存储，支持单侧选择 by AI.Coding */
  const [formStartDate, setFormStartDate] = useState<dayjs.Dayjs | null>(null);
  const [formEndDate, setFormEndDate] = useState<dayjs.Dayjs | null>(null);
  const [formPhase, setFormPhase] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSprints();
  }, []);

  /** 重置表单 by AI.Coding */
  const resetForm = () => {
    setFormName('');
    setFormStartDate(null);
    setFormEndDate(null);
    setFormPhase('');
    setEditingSprint(null);
  };

  const handleAdd = () => {
    resetForm();
    setModalVisible(true);
  };

  const handleEdit = (sprint: Sprint) => {
    setEditingSprint(sprint);
    setFormName(sprint.name);
    setFormStartDate(sprint.start_date ? dayjs(sprint.start_date) : null);
    setFormEndDate(sprint.end_date ? dayjs(sprint.end_date) : null);
    setFormPhase(sprint.phase || '');
    setModalVisible(true);
  };

  /** 保存（新增或编辑）by AI.Coding */
  const handleSave = async () => {
    if (!formName.trim()) {
      message.warning('请输入迭代名称');
      return;
    }
    setSaving(true);
    try {
      const startDate = formStartDate?.format('YYYY-MM-DD') || undefined;
      const endDate = formEndDate?.format('YYYY-MM-DD') || undefined;
      const phase = formPhase || undefined;

      if (editingSprint) {
        const dto: UpdateSprintDto = {
          id: editingSprint.id,
          name: formName !== editingSprint.name ? formName : undefined,
          // 清空字段用空字符串标记，后端转 NULL by AI.Coding
          start_date: (startDate || '') !== (editingSprint.start_date || '') ? (startDate || '') : undefined,
          end_date: (endDate || '') !== (editingSprint.end_date || '') ? (endDate || '') : undefined,
          phase: (formPhase || '') !== (editingSprint.phase || '') ? (formPhase || '') : undefined,
        };
        await updateSprint(dto);
        message.success('更新成功');
      } else {
        const dto: CreateSprintDto = { name: formName, start_date: startDate, end_date: endDate, phase };
        await createSprint(dto);
        message.success('创建成功');
      }
      setModalVisible(false);
      resetForm();
    } catch (e) {
      message.error(String(e) || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /**
   * 删除迭代 - 根据关联任务数决定是否弹窗确认 by AI.Coding
   * 无关联任务直接删除，有关联任务弹窗警告
   */
  const handleDelete = (sprint: Sprint) => {
    const taskCount = sprint.task_count || 0;
    if (taskCount === 0) {
      // 无关联任务，直接删除
      doDelete(sprint.id, 0);
    } else {
      // 有关联任务，弹窗警告
      Modal.confirm({
        title: '删除确认',
        content: (
          <span>
            该迭代关联 <Text strong>{taskCount}</Text> 个任务，删除后任务将移出迭代。确定删除？
          </span>
        ),
        okText: '确定删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => doDelete(sprint.id, taskCount),
      });
    }
  };

  /** 执行删除 by AI.Coding */
  const doDelete = async (id: number, expectedCount: number) => {
    try {
      const unlinked = await deleteSprint(id);
      if (expectedCount > 0 || unlinked > 0) {
        message.success(`已删除，${unlinked} 个任务已移出迭代`);
      } else {
        message.success('已删除');
      }
    } catch (e) {
      message.error(String(e) || '删除失败');
    }
  };

  const columns = [
    { title: '迭代名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '起止日期',
      key: 'dates',
      width: 220,
      render: (_: unknown, record: Sprint) => {
        if (!record.start_date && !record.end_date) return '-';
        return `${record.start_date || '?'} ~ ${record.end_date || '?'}`;
      },
    },
    {
      title: '阶段',
      dataIndex: 'phase',
      key: 'phase',
      width: 100,
      render: (phase: string | undefined) =>
        phase ? <Tag color="blue">{phase}</Tag> : '-',
    },
    {
      title: '关联任务',
      dataIndex: 'task_count',
      key: 'task_count',
      width: 100,
      render: (count: number | undefined) => count ?? 0,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: unknown, record: Sprint) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>迭代管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增迭代
        </Button>
      </div>

      <Spin spinning={loading}>
        <Table
          dataSource={sprints}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      </Spin>

      <Modal
        title={editingSprint ? '编辑迭代' : '新增迭代'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => { setModalVisible(false); resetForm(); }}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <div style={{ marginBottom: 4 }}>名称 <span style={{ color: 'red' }}>*</span></div>
            <Input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="输入迭代名称"
            />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>起止日期</div>
            <Space>
              <DatePicker
                placeholder="开始日期"
                value={formStartDate}
                onChange={d => setFormStartDate(d)}
              />
              <DatePicker
                placeholder="结束日期"
                value={formEndDate}
                onChange={d => setFormEndDate(d)}
              />
            </Space>
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>阶段</div>
            <Input
              value={formPhase}
              onChange={e => setFormPhase(e.target.value)}
              placeholder="如：开发、测试、发布"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
