import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Input, Select, message, Popconfirm, Typography } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTaskStore } from '../../stores/taskStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { StatusBadge, PriorityBadge, TaskTypeBadge } from '../common/StatusBadge';
import { TaskForm } from './TaskForm';
import { ExportDialog } from '../excel/ExportDialog';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../../lib/types';
import type { Task, TaskFilter } from '../../lib/types';

const { Title } = Typography;

export const TaskList: React.FC = () => {
  const { tasks, loading, fetchTasks, deleteTask, taskCount, fetchTaskCount } = useTaskStore();
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { sprints, fetchSprints } = useSprintStore();
  const [formVisible, setFormVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Local filter state - only applied on search click
  const [localFilter, setLocalFilter] = useState<TaskFilter>({});

  useEffect(() => {
    fetchTasks();
    fetchTaskCount();
    fetchDevelopers();
    fetchSprints();
  }, []);

  const handleSearch = () => {
    useTaskStore.getState().setFilter(localFilter);
    fetchTasks(localFilter);
    fetchTaskCount();
  };

  const handleReset = () => {
    setLocalFilter({});
    useTaskStore.getState().setFilter({});
    fetchTasks({});
    fetchTaskCount();
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormVisible(true);
  };

  const handleCreate = () => {
    setEditingTask(null);
    setFormVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTask(id);
      message.success('任务已删除');
    } catch (e) {
      message.error('删除失败: ' + String(e));
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    let success = 0;
    let fail = 0;
    for (const key of selectedRowKeys) {
      try {
        await deleteTask(key as number);
        success++;
      } catch {
        fail++;
      }
    }
    setBatchDeleting(false);
    setSelectedRowKeys([]);
    fetchTaskCount();
    message.success(`已删除 ${success} 条任务${fail > 0 ? `，${fail} 条失败` : ''}`);
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'task_type',
      width: 100,
      render: (v: string) => <TaskTypeBadge taskType={v} />,
    },
    {
      title: '编号',
      dataIndex: 'external_id',
      width: 120,
    },
    {
      title: '名称',
      dataIndex: 'name',
      ellipsis: true,
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 100,
    },
    {
      title: '迭代',
      dataIndex: 'sprint_name',
      width: 100,
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 80,
      render: (v: string) => <PriorityBadge priority={v} />,
    },
    {
      title: '计划开始',
      dataIndex: 'planned_start',
      width: 110,
    },
    {
      title: '计划结束',
      dataIndex: 'planned_end',
      width: 110,
    },
    {
      title: '工时',
      dataIndex: 'planned_hours',
      width: 90,
      render: (v: number) => v ? `${v}h (${(v / 8).toFixed(1)}d)` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: Task) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="确定删除此任务？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>任务列表 ({taskCount})</Title>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`确定删除选中的 ${selectedRowKeys.length} 条任务？`}
              onConfirm={handleBatchDelete}
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />} loading={batchDeleting}>
                批量删除 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
          <Button icon={<ExportOutlined />} onClick={() => setExportVisible(true)}>
            导出 Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建任务
          </Button>
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          placeholder="搜索任务..."
          allowClear
          style={{ width: 200 }}
          value={localFilter.search || ''}
          onChange={(e) => setLocalFilter({ ...localFilter, search: e.target.value || undefined })}
          onPressEnter={handleSearch}
        />
        <Select
          placeholder="状态"
          allowClear
          style={{ width: 120 }}
          value={localFilter.status}
          options={TASK_STATUSES.map(s => ({ label: s, value: s }))}
          onChange={(v) => setLocalFilter({ ...localFilter, status: v })}
        />
        <Select
          placeholder="优先级"
          allowClear
          style={{ width: 100 }}
          value={localFilter.priority}
          options={PRIORITIES.map(p => ({ label: p, value: p }))}
          onChange={(v) => setLocalFilter({ ...localFilter, priority: v })}
        />
        <Select
          placeholder="类型"
          allowClear
          style={{ width: 120 }}
          value={localFilter.task_type}
          options={TASK_TYPES.map(t => ({ label: t, value: t }))}
          onChange={(v) => setLocalFilter({ ...localFilter, task_type: v })}
        />
        <Select
          placeholder="负责人"
          allowClear
          style={{ width: 120 }}
          value={localFilter.owner_id}
          options={developers.map(d => ({ label: d.name, value: d.id }))}
          onChange={(v) => setLocalFilter({ ...localFilter, owner_id: v })}
        />
        <Select
          placeholder="迭代"
          allowClear
          style={{ width: 120 }}
          value={localFilter.sprint_id}
          options={sprints.map(s => ({ label: s.name, value: s.id }))}
          onChange={(v) => setLocalFilter({ ...localFilter, sprint_id: v })}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
          查询
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          重置
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        size="small"
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
        pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (total) => `共 ${total} 条` }}
        scroll={{ x: 1200 }}
      />

      <TaskForm
        visible={formVisible}
        task={editingTask}
        onClose={() => { setFormVisible(false); setEditingTask(null); }}
      />

      <ExportDialog
        open={exportVisible}
        onClose={() => setExportVisible(false)}
      />
    </div>
  );
};
