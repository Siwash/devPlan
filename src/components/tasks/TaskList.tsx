import React, { useEffect, useState, useCallback } from 'react';
import { Button, Space, Input, Select, message, Popconfirm, Typography, Modal } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTaskStore } from '../../stores/taskStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { EditableTaskTable } from './EditableTaskTable';
import { AiTaskToolbar } from './AiTaskToolbar';
import { ExportDialog } from '../excel/ExportDialog';
import { useClipboardPaste } from './useClipboardPaste';
import { batchApi, taskApi } from '../../lib/api';
import { TASK_TYPES, PRIORITIES, TASK_STATUSES } from '../../lib/types';
import type { Task, TaskFilter, CreateTaskDto, UpdateTaskDto } from '../../lib/types';

const { Title } = Typography;

const PASTE_FIELDS = [
  'task_type', 'external_id', 'name', 'owner_name', 'sprint_name',
  'priority', 'planned_start', 'planned_end', 'planned_hours', 'status',
];

export const TaskList: React.FC = () => {
  const { tasks, loading, fetchTasks, createTask, updateTask, deleteTask, taskCount, fetchTaskCount } = useTaskStore();
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { sprints, fetchSprints } = useSprintStore();
  const [exportVisible, setExportVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [localFilter, setLocalFilter] = useState<TaskFilter>({});
  const [highlightedIds, setHighlightedIds] = useState<number[]>([]);

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

  const handleUpdateTask = async (dto: UpdateTaskDto) => {
    try {
      await updateTask(dto);
    } catch (e) {
      message.error('更新失败: ' + String(e));
    }
  };

  const handleCreateTask = async () => {
    try {
      await createTask({ name: '新任务', status: '待开始' });
      message.success('已创建新任务');
    } catch (e) {
      message.error('创建失败: ' + String(e));
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      await deleteTask(id);
      message.success('任务已删除');
    } catch (e) {
      message.error('删除失败: ' + String(e));
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      await batchApi.deleteTasks(selectedRowKeys as number[]);
      setSelectedRowKeys([]);
      fetchTasks();
      fetchTaskCount();
      message.success(`已删除 ${selectedRowKeys.length} 条任务`);
    } catch (e: any) {
      message.error(`批量删除失败: ${e}`);
    } finally {
      setBatchDeleting(false);
    }
  };

  const handlePaste = useCallback(async (rows: Record<string, string>[]) => {
    if (rows.length === 0) return;

    Modal.confirm({
      title: `粘贴确认`,
      content: `检测到 ${rows.length} 行数据，是否创建为新任务？`,
      onOk: async () => {
        try {
          const dtos: CreateTaskDto[] = rows.map(row => ({
            name: row.name || '未命名任务',
            task_type: row.task_type,
            external_id: row.external_id,
            priority: row.priority,
            status: row.status || '待开始',
            planned_start: row.planned_start,
            planned_end: row.planned_end,
            planned_hours: row.planned_hours ? parseFloat(row.planned_hours) : undefined,
          }));
          const ids = await batchApi.createTasks(dtos);
          message.success(`成功创建 ${ids.length} 条任务`);
          fetchTasks();
          fetchTaskCount();
        } catch (e: any) {
          message.error(`粘贴创建失败: ${e}`);
        }
      },
    });
  }, []);

  const { containerRef } = useClipboardPaste({
    columnFields: PASTE_FIELDS,
    onPaste: handlePaste,
  });

  const handleRefresh = () => {
    fetchTasks();
    fetchTaskCount();
  };

  const handleHighlight = (ids: number[]) => {
    setHighlightedIds(ids);
    // Auto-clear after 7 seconds
    setTimeout(() => setHighlightedIds([]), 7000);
  };

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>任务列表 ({taskCount})</Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTask}>
            新增任务
          </Button>
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
        </Space>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
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

      <div style={{ marginBottom: 12 }}>
        <AiTaskToolbar
          selectedTaskIds={selectedRowKeys as number[]}
          allTaskIds={tasks.map(t => t.id)}
          tasks={tasks}
          developers={developers}
          onRefresh={handleRefresh}
          onHighlight={handleHighlight}
        />
      </div>

      <EditableTaskTable
        tasks={tasks}
        developers={developers}
        sprints={sprints}
        loading={loading}
        onUpdateTask={handleUpdateTask}
        onCreateTask={handleCreateTask}
        onDeleteTask={handleDeleteTask}
        selectedRowKeys={selectedRowKeys}
        onSelectedRowKeysChange={setSelectedRowKeys}
        highlightedRowIds={highlightedIds}
      />

      <ExportDialog
        open={exportVisible}
        onClose={() => setExportVisible(false)}
      />
    </div>
  );
};
