import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Input, Collapse, Tag, Spin, Button, Badge } from 'antd';
import { ReloadOutlined, SearchOutlined, InboxOutlined } from '@ant-design/icons';
import { Draggable } from '@fullcalendar/interaction';
import { taskApi } from '../../lib/api';
import type { Task } from '../../lib/types';

interface Props {
  onTaskAssigned: () => void;
  onDragStart?: (ownerId: number, taskId: number) => void;
  onDragEnd?: () => void;
  pendingUnschedules?: Map<number, { unschedule?: boolean }>;
}

interface OwnerGroup {
  ownerName: string;
  tasks: Task[];
}

interface SprintGroup {
  sprintName: string;
  owners: OwnerGroup[];
  totalCount: number;
}

export const UnscheduledTaskPanel: React.FC<Props> = ({
  onTaskAssigned,
  onDragStart,
  onDragEnd,
  pendingUnschedules,
}) => {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showDropZone, setShowDropZone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 用 ref 保存回调，避免 Draggable 重建
  const onDragStartRef = useRef(onDragStart);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => { onDragStartRef.current = onDragStart; }, [onDragStart]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const tasks = await taskApi.list({});
      setAllTasks(tasks);
    } catch (e) {
      console.error('Failed to load tasks:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // 监听刷新事件
  useEffect(() => {
    const handler = () => loadTasks();
    window.addEventListener('task-assigned', handler);
    window.addEventListener('task-updated', handler);
    return () => {
      window.removeEventListener('task-assigned', handler);
      window.removeEventListener('task-updated', handler);
    };
  }, [loadTasks]);

  // 监听日历内部拖拽事件 → 显示/隐藏放置区域
  useEffect(() => {
    const showHandler = () => setShowDropZone(true);
    const hideHandler = () => setShowDropZone(false);
    window.addEventListener('calendar-drag-start', showHandler);
    window.addEventListener('calendar-drag-stop', hideHandler);
    return () => {
      window.removeEventListener('calendar-drag-start', showHandler);
      window.removeEventListener('calendar-drag-stop', hideHandler);
    };
  }, []);

  // 过滤未排期任务（含 pending 中被取消排期的任务）
  const unscheduledTasks = useMemo(() => {
    const pendingUnscheduleIds = new Set<number>();
    if (pendingUnschedules) {
      pendingUnschedules.forEach((mut, id) => {
        if (mut.unschedule) pendingUnscheduleIds.add(id);
      });
    }

    return allTasks.filter(t => {
      const unscheduled = !t.planned_start || !t.planned_end || pendingUnscheduleIds.has(t.id);
      if (!unscheduled) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          (t.name && t.name.toLowerCase().includes(s)) ||
          (t.owner_name && t.owner_name.toLowerCase().includes(s)) ||
          (t.task_type && t.task_type.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [allTasks, search, pendingUnschedules]);

  // 按迭代 + 人员分组
  const groupedTasks = useMemo((): SprintGroup[] => {
    const sprintMap = new Map<string, Map<string, Task[]>>();

    unscheduledTasks.forEach(t => {
      const sprint = t.sprint_name || '未分配迭代';
      const owner = t.owner_name || '未分配人员';
      if (!sprintMap.has(sprint)) sprintMap.set(sprint, new Map());
      const ownerMap = sprintMap.get(sprint)!;
      if (!ownerMap.has(owner)) ownerMap.set(owner, []);
      ownerMap.get(owner)!.push(t);
    });

    return Array.from(sprintMap.entries()).map(([sprintName, ownerMap]) => {
      const owners = Array.from(ownerMap.entries()).map(([ownerName, tasks]) => ({
        ownerName,
        tasks,
      }));
      const totalCount = owners.reduce((sum, o) => sum + o.tasks.length, 0);
      return { sprintName, owners, totalCount };
    });
  }, [unscheduledTasks]);

  // FullCalendar 外部拖拽绑定 + 热力图触发
  useEffect(() => {
    if (!containerRef.current) return;

    let dragActive = false;

    const draggable = new Draggable(containerRef.current, {
      itemSelector: '.unscheduled-task-item',
      eventData: (eventEl) => {
        const taskId = eventEl.getAttribute('data-task-id');
        const taskName = eventEl.getAttribute('data-task-name');
        const hours = parseFloat(eventEl.getAttribute('data-hours') || '0');
        const ownerId = eventEl.getAttribute('data-owner-id');
        const ownerName = eventEl.getAttribute('data-owner-name');
        const sprintId = eventEl.getAttribute('data-sprint-id');
        const sprintName = eventEl.getAttribute('data-sprint-name');
        const taskType = eventEl.getAttribute('data-task-type');
        const days = hours > 0 ? Math.max(1, Math.ceil(hours / 8)) : 1;

        // 在 eventData 回调中触发热力图（最可靠的时机）
        if (ownerId && onDragStartRef.current) {
          dragActive = true;
          onDragStartRef.current(parseInt(ownerId), parseInt(taskId!));
        }

        return {
          title: taskName,
          duration: { days },
          extendedProps: {
            task_id: parseInt(taskId!),
            owner_id: ownerId ? parseInt(ownerId) : undefined,
            owner_name: ownerName || undefined,
            sprint_id: sprintId ? parseInt(sprintId) : undefined,
            sprint_name: sprintName || undefined,
            task_type: taskType || undefined,
            fromExternal: true,
          },
        };
      },
    });

    // 拖拽结束时清除热力图
    const handlePointerUp = () => {
      if (dragActive) {
        dragActive = false;
        onDragEndRef.current?.();
      }
    };
    document.addEventListener('pointerup', handlePointerUp);

    return () => {
      draggable.destroy();
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [groupedTasks]);

  return (
    <div className="unscheduled-panel">
      <div style={{ padding: '12px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
          未排期任务
          <Badge
            count={unscheduledTasks.length}
            style={{ backgroundColor: '#1890ff', marginLeft: 8 }}
            overflowCount={999}
          />
        </span>
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          onClick={loadTasks}
          loading={loading}
        />
      </div>

      <div style={{ padding: '8px 12px' }}>
        <Input
          placeholder="搜索任务..."
          prefix={<SearchOutlined />}
          size="small"
          allowClear
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* 拖拽放置区域提示 */}
      {showDropZone && (
        <div className="unschedule-drop-zone">
          <InboxOutlined style={{ fontSize: 24, marginBottom: 4 }} />
          <span>拖到此处取消排期</span>
        </div>
      )}

      <div className="unscheduled-panel-body" ref={containerRef}>
        <Spin spinning={loading}>
          {groupedTasks.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
              没有未排期任务
            </div>
          )}
          <Collapse
            defaultActiveKey={groupedTasks.map(g => g.sprintName)}
            ghost
            size="small"
            items={groupedTasks.map(group => ({
              key: group.sprintName,
              label: (
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {group.sprintName}
                  <span style={{ color: '#999', fontWeight: 400, marginLeft: 4 }}>
                    ({group.totalCount})
                  </span>
                </span>
              ),
              children: (
                <Collapse
                  ghost
                  size="small"
                  defaultActiveKey={group.owners.map(o => o.ownerName)}
                  items={group.owners.map(owner => ({
                    key: owner.ownerName,
                    label: (
                      <span style={{ fontSize: 12 }}>
                        {owner.ownerName}
                        <span style={{ color: '#999', marginLeft: 4 }}>
                          ({owner.tasks.length})
                        </span>
                      </span>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {owner.tasks.map(task => (
                          <div
                            key={task.id}
                            className="unscheduled-task-item"
                            data-task-id={task.id}
                            data-task-name={task.name}
                            data-hours={task.planned_hours || 0}
                            data-owner-id={task.owner_id || ''}
                            data-owner-name={task.owner_name || ''}
                            data-sprint-id={task.sprint_id || ''}
                            data-sprint-name={task.sprint_name || ''}
                            data-task-type={task.task_type || ''}
                          >
                            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '18px' }}>
                              {task.name}
                            </div>
                            <div style={{ fontSize: 11, color: '#999', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                              {task.task_type && <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{task.task_type}</Tag>}
                              {task.planned_hours != null && task.planned_hours > 0 && <span>{task.planned_hours}h</span>}
                              {task.priority && <span>{task.priority}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ),
                  }))}
                />
              ),
            }))}
          />
        </Spin>
      </div>
    </div>
  );
};
