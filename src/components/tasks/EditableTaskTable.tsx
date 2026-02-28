import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Table, Button, Popconfirm, Space, message, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';

import type {
  Task,
  UpdateTaskDto,
  CreateTaskDto,
  Developer,
  Sprint,
  DeveloperWorkload,
} from '../../lib/types';
import {
  TASK_TYPES,
  PRIORITIES,
  TASK_STATUSES,
} from '../../lib/types';
import { StatusBadge, PriorityBadge, TaskTypeBadge } from '../common/StatusBadge';
import { EditableCell } from './EditableCell';
import { formatHours, hoursToDisplayValue, inputToHours } from '../../lib/formatHours';
import { useSettingsStore } from '../../stores/settingsStore';
import { batchApi, calendarApi } from '../../lib/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface EditableTaskTableProps {
  tasks: Task[];
  developers: Developer[];
  sprints: Sprint[];
  onUpdateTask: (dto: UpdateTaskDto) => Promise<void> | void;
  onDeleteTask: (id: number) => Promise<void> | void;
  onCreateTask: (dto: CreateTaskDto) => Promise<void> | void;
  /** Controlled selected row keys for batch operations. */
  selectedRowKeys?: React.Key[];
  onSelectedRowKeysChange?: (keys: React.Key[]) => void;
  loading?: boolean;
  /** Task IDs highlighted by AI operations. */
  highlightedRowIds?: number[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const EditableTaskTable: React.FC<EditableTaskTableProps> = ({
  tasks,
  developers,
  sprints,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  selectedRowKeys: controlledSelectedKeys,
  onSelectedRowKeysChange,
  loading = false,
  highlightedRowIds = [],
}) => {
  // Local copy of tasks for optimistic updates
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const workHoursConfig = useSettingsStore((s) => s.workHoursConfig);

  // Keep localTasks in sync when external tasks change (e.g. after server refresh)
  const prevTasksRef = useRef(tasks);
  if (tasks !== prevTasksRef.current) {
    prevTasksRef.current = tasks;
    setLocalTasks(tasks);
  }

  // Row selection – use controlled props if provided, otherwise own state
  const [internalSelectedKeys, setInternalSelectedKeys] = useState<React.Key[]>([]);
  const selectedRowKeys = controlledSelectedKeys ?? internalSelectedKeys;
  const setSelectedRowKeys = onSelectedRowKeysChange ?? setInternalSelectedKeys;

  // Debounce timers per task id
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // ------ Fill drag state ------
  interface FillDragState {
    sourceTaskId: number;
    sourceField: string;
    sourceValue: any;
    targetTaskIds: number[];
  }
  const [fillDrag, setFillDrag] = useState<FillDragState | null>(null);
  const fillDragRef = useRef<FillDragState | null>(null);

  const handleFillStart = useCallback((taskId: number, field: string, value: any) => {
    const state: FillDragState = {
      sourceTaskId: taskId,
      sourceField: field,
      sourceValue: value,
      targetTaskIds: [],
    };
    fillDragRef.current = state;
    setFillDrag(state);
    document.body.classList.add('fill-dragging');

    const handleMouseMove = (e: MouseEvent) => {
      requestAnimationFrame(() => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const row = el?.closest('tr[data-row-key]');
        if (!row) return;
        const rowKey = Number(row.getAttribute('data-row-key'));
        if (!rowKey || rowKey === taskId) {
          if (fillDragRef.current) {
            fillDragRef.current = { ...fillDragRef.current, targetTaskIds: [] };
            setFillDrag(fillDragRef.current);
          }
          return;
        }
        // Find range between source and target
        const sourceIdx = localTasks.findIndex(t => t.id === taskId);
        const targetIdx = localTasks.findIndex(t => t.id === rowKey);
        if (sourceIdx < 0 || targetIdx < 0) return;
        const start = Math.min(sourceIdx, targetIdx);
        const end = Math.max(sourceIdx, targetIdx);
        const ids = localTasks.slice(start, end + 1)
          .map(t => t.id)
          .filter(id => id !== taskId);
        if (fillDragRef.current) {
          fillDragRef.current = { ...fillDragRef.current, targetTaskIds: ids };
          setFillDrag(fillDragRef.current);
        }
      });
    };

    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('fill-dragging');
      const dragState = fillDragRef.current;
      fillDragRef.current = null;
      setFillDrag(null);

      if (!dragState || dragState.targetTaskIds.length === 0) return;

      // Optimistic update
      setLocalTasks(prev => prev.map(t => {
        if (!dragState.targetTaskIds.includes(t.id)) return t;
        const updated = { ...t, [dragState.sourceField]: dragState.sourceValue };
        if (dragState.sourceField === 'owner_id') {
          const dev = developers.find(d => d.id === dragState.sourceValue);
          updated.owner_name = dev?.name;
        }
        if (dragState.sourceField === 'sprint_id') {
          const sprint = sprints.find(s => s.id === dragState.sourceValue);
          updated.sprint_name = sprint?.name;
        }
        return updated;
      }));

      // Batch update
      try {
        const updates: UpdateTaskDto[] = dragState.targetTaskIds.map(id => ({
          id,
          [dragState.sourceField]: dragState.sourceValue,
        }));
        await batchApi.updateTasks(updates);
        message.success(`已填充 ${updates.length} 行`);
      } catch (e: any) {
        message.error(`填充失败: ${e}`);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [localTasks, developers, sprints]);

  const fillTargetSet = useMemo(
    () => new Set(fillDrag?.targetTaskIds || []),
    [fillDrag],
  );

  // ------ Workload cache for date exclusion ------
  const [ownerWorkloads, setOwnerWorkloads] = useState<Map<number, DeveloperWorkload[]>>(new Map());
  const workloadLoadingRef = useRef<Set<number>>(new Set());
  const ownerWorkloadsRef = useRef(ownerWorkloads);
  ownerWorkloadsRef.current = ownerWorkloads;

  /** Load workload data for a developer (lazy, called when date picker opens) */
  const loadOwnerWorkload = useCallback((developerId: number) => {
    if (ownerWorkloadsRef.current.has(developerId) || workloadLoadingRef.current.has(developerId)) return;
    workloadLoadingRef.current.add(developerId);

    const rangeStart = dayjs().subtract(1, 'month').format('YYYY-MM-DD');
    const rangeEnd = dayjs().add(1, 'month').format('YYYY-MM-DD');

    calendarApi
      .getWorkload(developerId, rangeStart, rangeEnd, true)
      .then((workloads) => {
        setOwnerWorkloads(prev => {
          const next = new Map(prev);
          next.set(developerId, workloads);
          return next;
        });
      })
      .catch(() => {
        // Silently fail — date exclusion just won't show
      })
      .finally(() => {
        workloadLoadingRef.current.delete(developerId);
      });
  }, []);

  /** Returns true if the date is fully booked for other tasks (should be disabled) */
  const getDisabledDate = useCallback(
    (record: Task) => (current: Dayjs): boolean => {
      if (!record.owner_id) return false;
      const dateStr = current.format('YYYY-MM-DD');
      const workloads = ownerWorkloads.get(record.owner_id);
      if (!workloads) return false;
      const w = workloads.find(item => item.date === dateStr);
      if (!w) return false;
      const otherHours = w.tasks
        .filter(t => t.task_id !== record.id)
        .reduce((sum, t) => sum + t.daily_hours, 0);
      return otherHours >= w.max_hours;
    },
    [ownerWorkloads],
  );

  /** Custom cell render: yellow background for nearly-full dates */
  const getDateCellRender = useCallback(
    (record: Task) =>
      (current: Dayjs, info: { originNode: React.ReactNode }): React.ReactNode => {
        if (!record.owner_id) return info.originNode;
        const dateStr = current.format('YYYY-MM-DD');
        const workloads = ownerWorkloads.get(record.owner_id);
        if (!workloads) return info.originNode;
        const w = workloads.find(item => item.date === dateStr);
        if (!w) return info.originNode;

        const otherHours = w.tasks
          .filter(t => t.task_id !== record.id)
          .reduce((sum, t) => sum + t.daily_hours, 0);
        const remaining = w.max_hours - otherHours;

        if (remaining <= 0) {
          return (
            <Tooltip title={`已满 (${otherHours}/${w.max_hours}h)`} mouseEnterDelay={0.3}>
              <div className="workload-date-full">{info.originNode}</div>
            </Tooltip>
          );
        }
        if (remaining < 2) {
          return (
            <Tooltip title={`剩余 ${remaining.toFixed(1)}h`} mouseEnterDelay={0.3}>
              <div className="workload-date-nearly-full">{info.originNode}</div>
            </Tooltip>
          );
        }
        return info.originNode;
      },
    [ownerWorkloads],
  );

  // ------ Helpers ------
  const developerOptions = useMemo(
    () => developers.map((d) => ({ label: d.name, value: d.id })),
    [developers],
  );

  const sprintOptions = useMemo(
    () => sprints.map((s) => ({ label: s.name, value: s.id })),
    [sprints],
  );

  const taskTypeOptions = useMemo(
    () => TASK_TYPES.map((t) => ({ label: t, value: t })),
    [],
  );

  const priorityOptions = useMemo(
    () => PRIORITIES.map((p) => ({ label: p, value: p })),
    [],
  );

  const statusOptions = useMemo(
    () => TASK_STATUSES.map((s) => ({ label: s, value: s })),
    [],
  );

  // ------ Cell change handler with optimistic update + debounced persist ------
  const handleCellChange = useCallback(
    (taskId: number, field: string, newValue: any) => {
      // For nullable fields, convert null to empty string so the backend
      // can distinguish "clear this field" from "field not provided"
      const NULLABLE_FIELDS = ['planned_start', 'planned_end', 'external_id', 'description',
        'task_type', 'priority', 'parent_number', 'parent_name', 'status'];
      const valueToSend = (newValue == null && NULLABLE_FIELDS.includes(field)) ? '' : newValue;

      // Optimistic local update
      setLocalTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;

          const updated = { ...t, [field]: newValue };

          // When owner_id changes, also update owner_name for display
          if (field === 'owner_id') {
            const dev = developers.find((d) => d.id === newValue);
            updated.owner_name = dev?.name;
          }
          // When sprint_id changes, also update sprint_name for display
          if (field === 'sprint_id') {
            const sprint = sprints.find((s) => s.id === newValue);
            updated.sprint_name = sprint?.name;
          }
          return updated;
        }),
      );

      // Debounce the server call (500ms)
      if (debounceTimers.current[taskId]) {
        clearTimeout(debounceTimers.current[taskId]);
      }
      debounceTimers.current[taskId] = setTimeout(() => {
        const dto: UpdateTaskDto = { id: taskId, [field]: valueToSend };
        onUpdateTask(dto);
        delete debounceTimers.current[taskId];

        // Invalidate workload cache when date or owner changes
        if (field === 'planned_start' || field === 'planned_end' || field === 'planned_hours' || field === 'owner_id') {
          const task = localTasks.find(t => t.id === taskId);
          if (task?.owner_id) {
            setOwnerWorkloads(prev => {
              const next = new Map(prev);
              next.delete(task.owner_id!);
              return next;
            });
          }
          // If owner changed, also invalidate the new owner
          if (field === 'owner_id' && newValue) {
            setOwnerWorkloads(prev => {
              const next = new Map(prev);
              next.delete(newValue);
              return next;
            });
          }
        }
      }, 500);
    },
    [developers, sprints, onUpdateTask, localTasks],
  );

  // ------ Add new task ------
  const handleAddTask = useCallback(() => {
    const dto: CreateTaskDto = {
      name: '新任务',
    };
    onCreateTask(dto);
  }, [onCreateTask]);

  // ------ Render helper for an editable cell ------
  const renderEditableCell = (
    task: Task,
    field: keyof Task,
    columnType: 'text' | 'select' | 'date' | 'number',
    options?: { label: string; value: any }[],
    displayRender?: (value: any) => React.ReactNode,
  ) => {
    // For owner / sprint we edit by id but display by name
    let cellValue: any;
    if (field === 'owner_name') {
      cellValue = task.owner_id;
    } else if (field === 'sprint_name') {
      cellValue = task.sprint_id;
    } else {
      cellValue = task[field];
    }

    const actualField =
      field === 'owner_name' ? 'owner_id' : field === 'sprint_name' ? 'sprint_id' : field;

    // Date-specific props for workload exclusion
    const isDateColumn = columnType === 'date';
    const dateProps = isDateColumn && task.owner_id
      ? {
          disabledDate: getDisabledDate(task),
          dateCellRender: getDateCellRender(task),
          onDatePickerOpen: () => loadOwnerWorkload(task.owner_id!),
        }
      : {};

    return (
      <EditableCell
        value={cellValue}
        columnType={columnType}
        options={options}
        onChange={(v) => handleCellChange(task.id, actualField as string, v)}
        displayRender={displayRender}
        showFillHandle
        onFillHandleMouseDown={() => handleFillStart(task.id, actualField as string, cellValue)}
        {...dateProps}
      />
    );
  };

  // ------ Columns ------
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  const statusOrder: Record<string, number> = { '待开始': 0, '进行中': 1, '已完成': 2, '暂停中': 3, '已取消': 4 };

  const columns: ColumnsType<Task> = [
    {
      title: '类型',
      dataIndex: 'task_type',
      width: 110,
      sorter: (a, b) => (a.task_type || '').localeCompare(b.task_type || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'task_type', 'select', taskTypeOptions, (v) => (
          <TaskTypeBadge taskType={v} />
        )),
    },
    {
      title: '编号',
      dataIndex: 'external_id',
      width: 120,
      sorter: (a, b) => (a.external_id || '').localeCompare(b.external_id || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'external_id', 'text'),
    },
    {
      title: '父级编号',
      dataIndex: 'parent_number',
      width: 120,
      sorter: (a, b) => (a.parent_number || '').localeCompare(b.parent_number || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'parent_number', 'text'),
    },
    {
      title: '父级项名称',
      dataIndex: 'parent_name',
      width: 150,
      sorter: (a, b) => (a.parent_name || '').localeCompare(b.parent_name || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'parent_name', 'text'),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
      ellipsis: true,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'name', 'text'),
    },
    {
      title: '负责人',
      dataIndex: 'owner_name',
      width: 110,
      sorter: (a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'owner_name', 'select', developerOptions),
    },
    {
      title: '迭代',
      dataIndex: 'sprint_name',
      width: 110,
      sorter: (a, b) => (a.sprint_name || '').localeCompare(b.sprint_name || ''),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'sprint_name', 'select', sprintOptions),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      sorter: (a, b) => (priorityOrder[a.priority || ''] ?? 99) - (priorityOrder[b.priority || ''] ?? 99),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'priority', 'select', priorityOptions, (v) => (
          <PriorityBadge priority={v} />
        )),
    },
    {
      title: '开始日期',
      dataIndex: 'planned_start',
      width: 130,
      sorter: (a, b) => {
        const da = a.planned_start ? new Date(a.planned_start).getTime() : Infinity;
        const db = b.planned_start ? new Date(b.planned_start).getTime() : Infinity;
        return da - db;
      },
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'planned_start', 'date'),
    },
    {
      title: '结束日期',
      dataIndex: 'planned_end',
      width: 130,
      sorter: (a, b) => {
        const da = a.planned_end ? new Date(a.planned_end).getTime() : Infinity;
        const db = b.planned_end ? new Date(b.planned_end).getTime() : Infinity;
        return da - db;
      },
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'planned_end', 'date'),
    },
    {
      title: '工时',
      dataIndex: 'planned_hours',
      width: 100,
      sorter: (a, b) => (a.planned_hours || 0) - (b.planned_hours || 0),
      render: (_: any, record: Task) => {
        const displayVal = hoursToDisplayValue(record.planned_hours, workHoursConfig);
        return (
          <EditableCell
            value={displayVal}
            columnType="number"
            onChange={(v) => {
              const hours = v != null ? inputToHours(v, workHoursConfig) : undefined;
              handleCellChange(record.id, 'planned_hours', hours);
            }}
            displayRender={(v) =>
              record.planned_hours != null ? formatHours(record.planned_hours, workHoursConfig) : null
            }
            showFillHandle
            onFillHandleMouseDown={() => handleFillStart(record.id, 'planned_hours', record.planned_hours)}
          />
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      sorter: (a, b) => (statusOrder[a.status || ''] ?? 99) - (statusOrder[b.status || ''] ?? 99),
      render: (_: any, record: Task) =>
        renderEditableCell(record, 'status', 'select', statusOptions, (v) => (
          <StatusBadge status={v} />
        )),
    },
    {
      title: '操作',
      width: 70,
      render: (_: any, record: Task) => (
        <Popconfirm title="确定删除此任务？" onConfirm={() => onDeleteTask(record.id)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // ------ Footer with add button ------
  const footer = () => (
    <div style={{ textAlign: 'center' }}>
      <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddTask} style={{ width: '100%' }}>
        添加任务
      </Button>
    </div>
  );

  const highlightSet = useMemo(() => new Set(highlightedRowIds), [highlightedRowIds]);

  return (
    <Table<Task>
      columns={columns}
      dataSource={localTasks}
      rowKey="id"
      loading={loading}
      size="small"
      showSorterTooltip={{ target: 'sorter-icon' }}
      rowClassName={(record) => {
        const classes: string[] = [];
        if (highlightSet.has(record.id)) classes.push('ai-highlighted-row');
        if (fillDrag && record.id === fillDrag.sourceTaskId && fillDrag.targetTaskIds.length > 0) classes.push('fill-drag-source');
        if (fillTargetSet.has(record.id)) classes.push('fill-drag-target');
        return classes.join(' ');
      }}
      rowSelection={{
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
      }}
      pagination={{
        defaultPageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: [20, 50, 100, 200],
        showTotal: (total) => `共 ${total} 条`,
      }}
      scroll={{ x: 1570 }}
      footer={footer}
    />
  );
};
