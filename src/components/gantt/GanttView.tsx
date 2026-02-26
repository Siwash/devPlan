import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Typography, Select, Tooltip, Switch } from 'antd';
import { useTaskStore } from '../../stores/taskStore';
import { useSprintStore } from '../../stores/sprintStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { TASK_TYPE_COLORS } from '../../lib/types';
import type { Task } from '../../lib/types';
import { formatHours } from '../../lib/formatHours';

const { Title } = Typography;

interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
  mergedStart: string;
  mergedEnd: string;
  totalHours: number;
}

function getGroupKey(task: Task): string | null {
  if (task.parent_task_id) return `pid-${task.parent_task_id}`;
  const match = task.name.match(/^【([^】]+)】/);
  return match ? match[1] : null;
}

export const GanttView: React.FC = () => {
  const { tasks, fetchTasks } = useTaskStore();
  const { sprints, fetchSprints } = useSprintStore();
  const workHoursConfig = useSettingsStore((s) => s.workHoursConfig);
  const [sprintId, setSprintId] = useState<number | undefined>(undefined);
  const [mergeMode, setMergeMode] = useState(true);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTasks();
    fetchSprints();
  }, []);

  const tasksWithDates = useMemo(() =>
    tasks.filter(t => t.planned_start && t.planned_end),
    [tasks]
  );

  const dateRange = useMemo(() => {
    if (tasksWithDates.length === 0) return { start: '', end: '', days: 0 };
    const starts = tasksWithDates.map(t => t.planned_start!);
    const ends = tasksWithDates.map(t => t.planned_end!);
    const start = starts.sort()[0];
    const end = ends.sort().reverse()[0];
    const days = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
    return { start, end, days: Math.max(days, 1) };
  }, [tasksWithDates]);

  // Build groups and ungrouped tasks
  const { groups, ungrouped } = useMemo(() => {
    const groupMap = new Map<string, Task[]>();
    const ungrouped: Task[] = [];

    for (const task of tasksWithDates) {
      const key = getGroupKey(task);
      if (key) {
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(task);
      } else {
        ungrouped.push(task);
      }
    }

    const groups: TaskGroup[] = [];
    for (const [key, tasks] of groupMap) {
      // Only group if there are 2+ tasks; single tasks go to ungrouped
      if (tasks.length < 2) {
        ungrouped.push(...tasks);
        continue;
      }
      const starts = tasks.map(t => t.planned_start!).sort();
      const ends = tasks.map(t => t.planned_end!).sort().reverse();
      const totalHours = tasks.reduce((sum, t) => sum + (t.planned_hours || 0), 0);
      const label = key.startsWith('pid-') ? `父任务#${key.slice(4)}` : `【${key}】`;
      groups.push({ key, label, tasks, mergedStart: starts[0], mergedEnd: ends[0], totalHours });
    }

    // Sort groups by mergedStart
    groups.sort((a, b) => a.mergedStart.localeCompare(b.mergedStart));

    return { groups, ungrouped };
  }, [tasksWithDates]);

  // Initialize collapsed: all groups collapsed by default when groups change
  useEffect(() => {
    setCollapsedKeys(new Set(groups.map(g => g.key)));
  }, [groups.length]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const getBarStyle = (task: Task) => {
    if (!task.planned_start || !task.planned_end || !dateRange.start) return {};
    const startOffset = Math.ceil((new Date(task.planned_start).getTime() - new Date(dateRange.start).getTime()) / 86400000);
    const duration = Math.ceil((new Date(task.planned_end).getTime() - new Date(task.planned_start).getTime()) / 86400000) + 1;
    const left = (startOffset / dateRange.days) * 100;
    const width = (duration / dateRange.days) * 100;
    const color = TASK_TYPE_COLORS[task.task_type || ''] || '#1890ff';
    return {
      position: 'absolute' as const,
      left: `${left}%`,
      width: `${Math.max(width, 1)}%`,
      height: 24,
      backgroundColor: color,
      borderRadius: 4,
      top: 4,
      opacity: task.status === '已完成' ? 0.6 : 1,
    };
  };

  const getGroupBarStyle = (group: TaskGroup) => {
    if (!dateRange.start) return {};
    const startOffset = Math.ceil((new Date(group.mergedStart).getTime() - new Date(dateRange.start).getTime()) / 86400000);
    const duration = Math.ceil((new Date(group.mergedEnd).getTime() - new Date(group.mergedStart).getTime()) / 86400000) + 1;
    const left = (startOffset / dateRange.days) * 100;
    const width = (duration / dateRange.days) * 100;
    return {
      position: 'absolute' as const,
      left: `${left}%`,
      width: `${Math.max(width, 1)}%`,
      height: 20,
      backgroundColor: '#1890ff',
      opacity: 0.25,
      borderRadius: 4,
      top: 6,
    };
  };

  const generateDateHeaders = () => {
    if (!dateRange.start || dateRange.days <= 0) return [];
    const headers = [];
    const start = new Date(dateRange.start);
    for (let i = 0; i < dateRange.days; i += 7) {
      const d = new Date(start.getTime() + i * 86400000);
      headers.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        left: (i / dateRange.days) * 100,
      });
    }
    return headers;
  };

  const renderTaskRow = (task: Task, indent = false) => (
    <div key={task.id} style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', height: 32, alignItems: 'center' }}>
      <div style={{
        width: 250, padding: indent ? '0 8px 0 28px' : '0 8px', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, flexShrink: 0,
        borderRight: '1px solid #f0f0f0',
      }}>
        <Tooltip title={`${task.name} | ${task.owner_name || ''} | ${task.planned_start} ~ ${task.planned_end}`}>
          {task.name}
        </Tooltip>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tooltip title={`${task.name} (${task.planned_start} ~ ${task.planned_end}) ${task.planned_hours ? formatHours(task.planned_hours, workHoursConfig) : ''}`}>
          <div style={getBarStyle(task)} />
        </Tooltip>
      </div>
    </div>
  );

  const renderGroupHeader = (group: TaskGroup) => {
    const collapsed = collapsedKeys.has(group.key);
    return (
      <div
        key={`group-${group.key}`}
        style={{
          display: 'flex', borderBottom: '1px solid #f0f0f0', height: 32, alignItems: 'center',
          background: '#fafafa', cursor: 'pointer',
        }}
        onClick={() => toggleCollapse(group.key)}
      >
        <div style={{
          width: 250, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, flexShrink: 0,
          borderRight: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
            ▶
          </span>
          <Tooltip title={`${group.label} | ${group.mergedStart} ~ ${group.mergedEnd} | ${group.tasks.length}个任务, ${formatHours(group.totalHours, workHoursConfig)}`}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {group.label}
            </span>
          </Tooltip>
          <span style={{ color: '#999', fontSize: 11, flexShrink: 0 }}>
            ({group.tasks.length}个, {formatHours(group.totalHours, workHoursConfig)})
          </span>
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <Tooltip title={`${group.label} ${group.mergedStart} ~ ${group.mergedEnd} (${group.tasks.length}个任务, ${formatHours(group.totalHours, workHoursConfig)})`}>
            <div style={getGroupBarStyle(group)} />
          </Tooltip>
        </div>
      </div>
    );
  };

  const renderMergedRows = () => {
    const rows: React.ReactNode[] = [];

    for (const group of groups) {
      rows.push(renderGroupHeader(group));
      if (!collapsedKeys.has(group.key)) {
        for (const task of group.tasks) {
          rows.push(renderTaskRow(task, true));
        }
      }
    }

    for (const task of ungrouped) {
      rows.push(renderTaskRow(task, false));
    }

    return rows;
  };

  const renderFlatRows = () => {
    return tasksWithDates.map(task => renderTaskRow(task, false));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>甘特图</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
            合并显示
            <Switch size="small" checked={mergeMode} onChange={setMergeMode} />
          </span>
          <Select
            placeholder="选择迭代"
            allowClear
            style={{ width: 150 }}
            options={sprints.map(s => ({ label: s.name, value: s.id }))}
            onChange={(v) => {
              setSprintId(v);
              fetchTasks(v ? { sprint_id: v } : {});
            }}
          />
        </div>
      </div>

      {tasksWithDates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          暂无带日期的任务数据，请先导入或创建任务
        </div>
      ) : (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
          {/* Date header */}
          <div style={{ position: 'relative', height: 30, background: '#fafafa', borderBottom: '1px solid #f0f0f0', paddingLeft: 250 }}>
            {generateDateHeaders().map((h, i) => (
              <span key={i} style={{ position: 'absolute', left: `calc(250px + ${h.left}%)`, fontSize: 11, color: '#666', top: 6 }}>
                {h.label}
              </span>
            ))}
          </div>

          {/* Task rows */}
          {mergeMode ? renderMergedRows() : renderFlatRows()}
        </div>
      )}
    </div>
  );
};
