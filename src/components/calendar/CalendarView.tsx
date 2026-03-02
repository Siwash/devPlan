import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import { Select, Typography, Space, Tooltip, Segmented, Tag, Button, Badge, message } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { calendarApi, taskApi, batchApi } from '../../lib/api';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { useTaskDetailStore } from '../../stores/taskDetailStore';
import { useTabStore } from '../../stores/tabStore';
import type { CalendarEvent, CalendarResource, CalendarEventExtProps, UpdateTaskDto, DeveloperWorkload } from '../../lib/types';
import { TASK_TYPE_COLORS } from '../../lib/types';
import { WorkloadPopover } from './WorkloadPopover';
import { QuickTaskInput } from './QuickTaskInput';
import { UnscheduledTaskPanel } from './UnscheduledTaskPanel';

const { Title } = Typography;

type Dimension = 'task' | 'person' | 'sprint';

const SPRINT_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#2f54eb', '#a0d911', '#faad14'];

// ─── Date helpers ────────────────────────────────────────

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** FullCalendar exclusive end → backend inclusive end */
function fcToBackendDate(fcEnd: Date | null, fcStart: Date): string {
  if (!fcEnd) return formatYMD(fcStart);
  const d = new Date(fcEnd);
  d.setDate(d.getDate() - 1);
  return formatYMD(d);
}

/** backend inclusive end → FullCalendar exclusive end */
function backendToFcEnd(backendEnd: string): string {
  const d = new Date(backendEnd);
  d.setDate(d.getDate() + 1);
  return formatYMD(d);
}

// ─── Component ───────────────────────────────────────────

export const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [selectedDevs, setSelectedDevs] = useState<number[]>([]);
  const [selectedSprints, setSelectedSprints] = useState<number[]>([]);
  const [dimension, setDimension] = useState<Dimension>('task');
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { sprints, fetchSprints } = useSprintStore();
  const { openTaskDetail } = useTaskDetailStore();
  const isFullscreen = useTabStore((s) => s.isFullscreen);
  const toggleFullscreen = useTabStore((s) => s.toggleFullscreen);
  const activeTab = useTabStore((s) => s.activeTab);
  const calendarRef = useRef<FullCalendar>(null);

  // ── 缓存 ──
  const visibleRangeRef = useRef<{ start: string; end: string }>({ start: '', end: '' });
  const workloadCacheRef = useRef<Map<number, DeveloperWorkload[]>>(new Map());
  const workloadLoadingRef = useRef<Set<number>>(new Set());
  const dayCellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const defaultSprintSetRef = useRef(false);

  // ── 批量保存 ──
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, UpdateTaskDto>>(new Map());
  const [pendingMutations, setPendingMutations] = useState<Map<number, {
    start?: string; end?: string; ownerId?: number; unschedule?: boolean;
    newEvent?: CalendarEvent; // 外部拖入的新事件
  }>>(new Map());
  const [batchSaving, setBatchSaving] = useState(false);
  const hasPending = pendingUpdates.size > 0;

  // ── 负载迷你图弹层 ──
  const [workloadPopover, setWorkloadPopover] = useState<{
    developerId: number;
    developerName: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  useEffect(() => {
    fetchDevelopers();
    fetchSprints();
    loadResources();
  }, []);

  // ── 默认选中最新迭代 ──
  useEffect(() => {
    if (sprints.length > 0 && !defaultSprintSetRef.current) {
      defaultSprintSetRef.current = true;
      const today = formatYMD(new Date());
      // 优先找包含今天的迭代
      const current = sprints.find(
        s => s.start_date && s.end_date && s.start_date <= today && s.end_date >= today
      );
      if (current) {
        setSelectedSprints([current.id]);
      } else {
        // 退而求其次：最近创建的迭代（ID最大）
        const latest = sprints.reduce((a, b) => (a.id > b.id ? a : b));
        setSelectedSprints([latest.id]);
      }
    }
  }, [sprints]);

  // 切换维度时清空图例筛选
  useEffect(() => {
    setHiddenLabels(new Set());
  }, [dimension]);

  // ESC 退出全屏
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) toggleFullscreen();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, toggleFullscreen]);

  // 切换到日历标签页时重新计算 FullCalendar 尺寸（修复 display:none→block 宽度丢失）
  useEffect(() => {
    if (activeTab === '/calendar') {
      const timer = setTimeout(() => {
        calendarRef.current?.getApi()?.updateSize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const loadResources = async () => {
    try {
      const res = await calendarApi.getResources();
      setResources(res);
    } catch (e) {
      console.error('Failed to load resources:', e);
    }
  };

  const loadEvents = useCallback(async (startDate: string, endDate: string) => {
    try {
      const evts = await calendarApi.getEvents(startDate, endDate);
      setEvents(evts.map(e => ({
        ...e,
        resourceId: e.resource_id,
        extendedProps: e.ext_props,
      })));
    } catch (e) {
      console.error('Failed to load events:', e);
    }
  }, []);

  /** Debounced reload */
  const reloadEvents = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      const { start, end } = visibleRangeRef.current;
      if (start && end) {
        loadEvents(start, end);
        workloadCacheRef.current.clear();
      }
    }, 300);
  }, [loadEvents]);

  // 监听 task-updated 事件刷新日历
  useEffect(() => {
    const handler = () => reloadEvents();
    window.addEventListener('task-updated', handler);
    return () => window.removeEventListener('task-updated', handler);
  }, [reloadEvents]);

  const handleDatesSet = useCallback((info: { startStr: string; endStr: string }) => {
    const start = info.startStr.split('T')[0];
    const end = info.endStr.split('T')[0];
    visibleRangeRef.current = { start, end };
    loadEvents(start, end);
    workloadCacheRef.current.clear();
  }, [loadEvents]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      const start = api.view.activeStart.toISOString().split('T')[0];
      const end = api.view.activeEnd.toISOString().split('T')[0];
      visibleRangeRef.current = { start, end };
      loadEvents(start, end);
    }
  }, [loadEvents]);

  // ── 负载缓存加载 ──
  const loadWorkloadCached = useCallback(async (developerId: number): Promise<DeveloperWorkload[]> => {
    const cached = workloadCacheRef.current.get(developerId);
    if (cached) return cached;

    if (workloadLoadingRef.current.has(developerId)) {
      return new Promise((resolve) => {
        const check = () => {
          const c = workloadCacheRef.current.get(developerId);
          if (c) resolve(c);
          else setTimeout(check, 50);
        };
        setTimeout(check, 50);
      });
    }

    workloadLoadingRef.current.add(developerId);
    try {
      const { start, end } = visibleRangeRef.current;
      const workloads = await calendarApi.getWorkload(developerId, start, end, true);
      workloadCacheRef.current.set(developerId, workloads);
      return workloads;
    } catch {
      return [];
    } finally {
      workloadLoadingRef.current.delete(developerId);
    }
  }, []);

  // ── 热力图着色/清除 ──
  const applyHeatmap = useCallback((workloads: DeveloperWorkload[], excludeTaskId: number) => {
    dayCellRefs.current.forEach((el, date) => {
      const w = workloads.find(x => x.date === date);
      if (!w) return;
      const otherHours = w.tasks
        .filter(t => t.task_id !== excludeTaskId)
        .reduce((sum, t) => sum + t.daily_hours, 0);
      const remaining = w.max_hours - otherHours;
      if (remaining <= 0) el.classList.add('calendar-day-full');
      else if (remaining < 2) el.classList.add('calendar-day-nearly-full');
    });
  }, []);

  const clearHeatmap = useCallback(() => {
    dayCellRefs.current.forEach(el => {
      el.classList.remove('calendar-day-full', 'calendar-day-nearly-full');
    });
  }, []);

  const showWorkloadPopover = useCallback((ownerId: number, ownerName: string) => {
    const { start, end } = visibleRangeRef.current;
    if (!start || !end) return;
    setWorkloadPopover({ developerId: ownerId, developerName: ownerName, startDate: start, endDate: end });
  }, []);

  // ── 批量保存：添加一个挂起的更新 ──
  const addPendingUpdate = useCallback((dto: UpdateTaskDto, mutation: {
    start?: string; end?: string; ownerId?: number; unschedule?: boolean;
    newEvent?: CalendarEvent;
  }) => {
    setPendingUpdates(prev => {
      const next = new Map(prev);
      // 合并同一个 task 的多次更新
      const existing = next.get(dto.id);
      next.set(dto.id, existing ? { ...existing, ...dto } : dto);
      return next;
    });
    setPendingMutations(prev => {
      const next = new Map(prev);
      next.set(dto.id, mutation);
      return next;
    });
  }, []);

  // ── 批量保存：执行 ──
  const handleBatchSave = useCallback(async () => {
    if (pendingUpdates.size === 0) return;
    setBatchSaving(true);
    try {
      const updates = Array.from(pendingUpdates.values());
      await batchApi.updateTasks(updates);
      message.success(`已保存 ${updates.length} 项更改`);
      setPendingUpdates(new Map());
      setPendingMutations(new Map());
      reloadEvents();
      window.dispatchEvent(new Event('task-assigned'));
    } catch (e) {
      message.error('批量保存失败: ' + String(e));
    } finally {
      setBatchSaving(false);
    }
  }, [pendingUpdates, reloadEvents]);

  // ── 批量保存：丢弃 ──
  const handleBatchDiscard = useCallback(() => {
    setPendingUpdates(new Map());
    setPendingMutations(new Map());
    reloadEvents();
  }, [reloadEvents]);

  // ── eventDrop ──
  const handleEventDrop = useCallback(async (info: any) => {
    const props = info.event.extendedProps;
    const taskId = props?.task_id;
    if (!taskId) { info.revert(); return; }

    const dto: UpdateTaskDto = {
      id: taskId,
      planned_start: formatYMD(info.event.start!),
      planned_end: fcToBackendDate(info.event.end, info.event.start!),
    };

    let ownerId = props?.owner_id;
    let ownerName = props?.owner_name || '';
    if (info.newResource) {
      const newOwnerId = parseInt(info.newResource.id);
      dto.owner_id = newOwnerId;
      ownerId = newOwnerId;
      ownerName = info.newResource.title || ownerName;
    }

    if (isFullscreen) {
      // 批量模式：同步更新本地 events 状态（防止 re-render 还原拖拽位置）
      setEvents(prev => prev.map(e => {
        const p = (e.extendedProps || e.ext_props) as CalendarEventExtProps;
        if (p?.task_id === taskId) {
          return {
            ...e,
            start: formatYMD(info.event.start!),
            end: info.event.end ? formatYMD(info.event.end) : e.end,
            ...(dto.owner_id != null ? {
              resource_id: String(dto.owner_id),
              resourceId: String(dto.owner_id),
            } : {}),
          };
        }
        return e;
      }));
      addPendingUpdate(dto, {
        start: dto.planned_start,
        end: dto.planned_end,
        ownerId: dto.owner_id,
      });
    } else {
      try {
        await taskApi.update(dto);
        message.success('任务已更新');
        reloadEvents();
        if (ownerId) showWorkloadPopover(ownerId, ownerName);
      } catch (e) {
        info.revert();
        message.error('更新失败: ' + String(e));
      }
    }
  }, [isFullscreen, reloadEvents, showWorkloadPopover, addPendingUpdate]);

  // ── eventResize ──
  const handleEventResize = useCallback(async (info: any) => {
    const props = info.event.extendedProps;
    const taskId = props?.task_id;
    if (!taskId) { info.revert(); return; }

    const dto: UpdateTaskDto = {
      id: taskId,
      planned_start: formatYMD(info.event.start!),
      planned_end: fcToBackendDate(info.event.end, info.event.start!),
    };

    if (isFullscreen) {
      // 批量模式：同步更新本地 events 状态
      setEvents(prev => prev.map(e => {
        const p = (e.extendedProps || e.ext_props) as CalendarEventExtProps;
        if (p?.task_id === taskId) {
          return {
            ...e,
            start: formatYMD(info.event.start!),
            end: info.event.end ? formatYMD(info.event.end) : e.end,
          };
        }
        return e;
      }));
      addPendingUpdate(dto, { start: dto.planned_start, end: dto.planned_end });
    } else {
      try {
        await taskApi.update(dto);
        message.success('任务已更新');
        reloadEvents();
        const ownerId = props?.owner_id;
        const ownerName = props?.owner_name || '';
        if (ownerId) showWorkloadPopover(ownerId, ownerName);
      } catch (e) {
        info.revert();
        message.error('更新失败: ' + String(e));
      }
    }
  }, [isFullscreen, reloadEvents, showWorkloadPopover, addPendingUpdate]);

  // ── eventDragStart：着色热力图 ──
  const handleEventDragStart = useCallback((info: any) => {
    const ownerId = info.event.extendedProps?.owner_id;
    const taskId = info.event.extendedProps?.task_id;
    if (!ownerId || !taskId) return;
    loadWorkloadCached(ownerId).then(workloads => {
      applyHeatmap(workloads, taskId);
    });
    // 通知未排期面板显示放置区域
    if (isFullscreen) {
      window.dispatchEvent(new Event('calendar-drag-start'));
    }
  }, [loadWorkloadCached, applyHeatmap, isFullscreen]);

  // ── eventDragStop：清除热力图 + 检测拖到未排期面板 ──
  const handleEventDragStop = useCallback((info: any) => {
    clearHeatmap();
    if (isFullscreen) {
      window.dispatchEvent(new Event('calendar-drag-stop'));

      // 检测是否拖到未排期面板区域
      const panelEl = document.querySelector('.unscheduled-panel');
      if (panelEl) {
        const rect = panelEl.getBoundingClientRect();
        const { clientX, clientY } = info.jsEvent;
        if (clientX >= rect.left && clientX <= rect.right &&
            clientY >= rect.top && clientY <= rect.bottom) {
          const taskId = info.event.extendedProps?.task_id;
          if (taskId) {
            const dto: UpdateTaskDto = { id: taskId, planned_start: '', planned_end: '' };
            // 乐观移除事件
            setEvents(prev => prev.filter(e => {
              const p = (e.extendedProps || e.ext_props) as CalendarEventExtProps;
              return p?.task_id !== taskId;
            }));
            addPendingUpdate(dto, { unschedule: true });
            message.info('任务已移至未排期（待保存）');
          }
        }
      }
    }
  }, [clearHeatmap, isFullscreen, addPendingUpdate]);

  // ── 外部拖拽热力图回调 ──
  const handleExternalDragStart = useCallback((ownerId: number, taskId: number) => {
    if (!ownerId) return;
    loadWorkloadCached(ownerId).then(workloads => {
      applyHeatmap(workloads, taskId);
    });
  }, [loadWorkloadCached, applyHeatmap]);

  const handleExternalDragEnd = useCallback(() => {
    clearHeatmap();
  }, [clearHeatmap]);

  const getSprintColor = (sprintId: number) => SPRINT_COLORS[sprintId % SPRINT_COLORS.length];

  // ── eventReceive：外部拖入日历 ──
  const handleEventReceive = useCallback(async (info: any) => {
    const props = info.event.extendedProps;
    const taskId = props?.task_id;
    if (!taskId || !props?.fromExternal) {
      info.revert();
      return;
    }

    const dto: UpdateTaskDto = {
      id: taskId,
      planned_start: formatYMD(info.event.start!),
      planned_end: fcToBackendDate(info.event.end, info.event.start!),
    };

    if (info.event.getResources?.().length > 0) {
      const resourceId = info.event.getResources()[0].id;
      const ownerId = parseInt(resourceId);
      if (!isNaN(ownerId)) {
        dto.owner_id = ownerId;
      }
    }

    if (isFullscreen) {
      // 批量模式：移除 FC 内部临时事件，改为加入 events 状态统一管理
      info.event.remove();
      const newEvt: CalendarEvent = {
        id: `pending-${taskId}`,
        title: info.event.title,
        start: formatYMD(info.event.start!),
        end: info.event.end ? formatYMD(info.event.end) : formatYMD(info.event.start!),
        color: '#1890ff',
        resource_id: dto.owner_id != null ? String(dto.owner_id) : (props.owner_id ? String(props.owner_id) : undefined),
        resourceId: dto.owner_id != null ? String(dto.owner_id) : (props.owner_id ? String(props.owner_id) : undefined),
        ext_props: {
          task_id: taskId,
          owner_id: dto.owner_id ?? props.owner_id,
          owner_name: props.owner_name,
          sprint_id: props.sprint_id,
          sprint_name: props.sprint_name,
          task_type: props.task_type,
          fromExternal: true,
        } as any,
        extendedProps: {
          task_id: taskId,
          owner_id: dto.owner_id ?? props.owner_id,
          owner_name: props.owner_name,
          sprint_id: props.sprint_id,
          sprint_name: props.sprint_name,
          task_type: props.task_type,
          fromExternal: true,
        } as any,
      } as any;
      setEvents(prev => [...prev, newEvt]);
      addPendingUpdate(dto, {
        start: dto.planned_start,
        end: dto.planned_end,
        ownerId: dto.owner_id,
      });
    } else {
      try {
        await taskApi.update(dto);
        message.success('任务已排期');
        reloadEvents();
        window.dispatchEvent(new Event('task-assigned'));
      } catch (e) {
        info.revert();
        message.error('排期失败: ' + String(e));
      }
    }
  }, [isFullscreen, reloadEvents, addPendingUpdate]);

  // ── Transform events ──
  const displayEvents = useMemo(() => {
    // 先排除被取消排期的事件（批量模式下乐观移除）
    let result = events.filter(evt => {
      const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
      const mut = pendingMutations.get(props.task_id);
      return !mut?.unschedule;
    });

    result = result.map(evt => {
      const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
      let color = evt.color;

      if (dimension === 'task') {
        color = TASK_TYPE_COLORS[props.task_type || ''] || '#1890ff';
      } else if (dimension === 'person') {
        const dev = developers.find(d => d.name === (props.owner_name || ''));
        color = dev?.avatar_color || '#1890ff';
      } else if (dimension === 'sprint') {
        const sprint = sprints.find(s => s.name === (props.sprint_name || ''));
        color = sprint ? getSprintColor(sprint.id) : '#d9d9d9';
      }

      let resourceId = evt.resourceId || evt.resource_id;
      if (dimension === 'sprint') {
        const sprint = sprints.find(s => s.name === (props.sprint_name || ''));
        resourceId = sprint ? `sprint-${sprint.id}` : 'no-sprint';
      }

      return { ...evt, color, resourceId };
    });

    // 人员多选过滤
    if (selectedDevs.length > 0) {
      result = result.filter(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        return props.owner_id != null && selectedDevs.includes(props.owner_id);
      });
    }

    // 迭代过滤
    if (selectedSprints.length > 0) {
      result = result.filter(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        return props.sprint_id != null && selectedSprints.includes(props.sprint_id);
      });
    }

    // 图例过滤
    if (hiddenLabels.size > 0) {
      result = result.filter(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        if (dimension === 'task') return !hiddenLabels.has(props.task_type || '');
        if (dimension === 'person') return !hiddenLabels.has(props.owner_name || '');
        if (dimension === 'sprint') return !hiddenLabels.has(props.sprint_name || '');
        return true;
      });
    }

    return result;
  }, [events, dimension, developers, sprints, hiddenLabels, selectedDevs, selectedSprints, pendingMutations]);

  // ── Transform resources ──
  const displayResources = useMemo(() => {
    if (dimension === 'sprint') {
      const sprintResources = sprints.map(s => ({
        id: `sprint-${s.id}`,
        title: s.name,
      }));
      sprintResources.push({ id: 'no-sprint', title: '未分配迭代' });
      return sprintResources;
    }
    return resources.map(r => ({ id: r.id, title: r.title }));
  }, [dimension, resources, sprints]);

  // ── Legend ──
  const legendItems = useMemo(() => {
    if (dimension === 'task') {
      const usedTypes = new Set<string>();
      events.forEach(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        if (props.task_type) usedTypes.add(props.task_type);
      });
      return Array.from(usedTypes).map(t => ({
        label: t,
        color: TASK_TYPE_COLORS[t] || '#1890ff',
      }));
    } else if (dimension === 'person') {
      const usedOwners = new Set<string>();
      events.forEach(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        if (props.owner_name) usedOwners.add(props.owner_name);
      });
      return Array.from(usedOwners).map(name => {
        const dev = developers.find(d => d.name === name);
        return { label: name, color: dev?.avatar_color || '#1890ff' };
      });
    } else {
      const usedSprints = new Set<string>();
      events.forEach(evt => {
        const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
        if (props.sprint_name) usedSprints.add(props.sprint_name);
      });
      return Array.from(usedSprints).map(name => {
        const sprint = sprints.find(s => s.name === name);
        return { label: name, color: sprint ? getSprintColor(sprint.id) : '#d9d9d9' };
      });
    }
  }, [dimension, events, developers, sprints]);

  const getEventTooltip = (evt: any) => {
    const props = evt.extendedProps || {};
    const parts = [evt.title];
    if (props.owner_name) parts.push(`负责人: ${props.owner_name}`);
    if (props.task_type) parts.push(`类型: ${props.task_type}`);
    if (props.status) parts.push(`状态: ${props.status}`);
    if (props.priority) parts.push(`优先级: ${props.priority}`);
    return parts.join(' | ');
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: isFullscreen ? 'calc(100vh - 48px)' : '100%' }}>
      {/* 左侧：日历区域 */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Title level={4} style={{ margin: 0 }}>日历视图</Title>
          <Space wrap>
            <QuickTaskInput onTaskCreated={reloadEvents} />
            <Segmented
              value={dimension}
              onChange={(v) => setDimension(v as Dimension)}
              options={[
                { label: '任务维度', value: 'task' },
                { label: '人员维度', value: 'person' },
                { label: '迭代维度', value: 'sprint' },
              ]}
            />
            <Select
              mode="multiple"
              placeholder="全部成员"
              allowClear
              maxTagCount="responsive"
              style={{ minWidth: 150, maxWidth: 300 }}
              value={selectedDevs}
              onChange={setSelectedDevs}
              options={developers.map(d => ({ label: d.name, value: d.id }))}
            />
            <Select
              mode="multiple"
              placeholder="全部迭代"
              allowClear
              maxTagCount="responsive"
              style={{ minWidth: 150, maxWidth: 300 }}
              value={selectedSprints}
              onChange={setSelectedSprints}
              options={sprints.map(s => ({ label: s.name, value: s.id }))}
            />
            <Button
              type="text"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              title={isFullscreen ? '退出全屏 (Esc)' : '全屏排期工作台'}
            />
          </Space>
        </div>

        {/* 图例 */}
        {legendItems.length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {legendItems.map(item => (
              <Tag
                key={item.label}
                color={hiddenLabels.has(item.label) ? undefined : item.color}
                style={{
                  margin: 0,
                  cursor: 'pointer',
                  opacity: hiddenLabels.has(item.label) ? 0.35 : 1,
                  textDecoration: hiddenLabels.has(item.label) ? 'line-through' : 'none',
                  border: hiddenLabels.has(item.label) ? '1px dashed #d9d9d9' : undefined,
                }}
                onClick={() => {
                  setHiddenLabels(prev => {
                    const next = new Set(prev);
                    next.has(item.label) ? next.delete(item.label) : next.add(item.label);
                    return next;
                  });
                }}
              >
                {item.label}
              </Tag>
            ))}
          </div>
        )}

        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimelinePlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,resourceTimelineMonth',
          }}
          locale="zh-cn"
          height={isFullscreen ? 'calc(100vh - 160px)' : 'auto'}
          events={displayEvents as any}
          resources={displayResources}
          datesSet={handleDatesSet}
          editable={true}
          droppable={true}
          eventResourceEditable={true}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventReceive={handleEventReceive}
          eventDragStart={handleEventDragStart}
          eventDragStop={handleEventDragStop}
          dayCellDidMount={(arg) => {
            dayCellRefs.current.set(formatYMD(arg.date), arg.el);
          }}
          dayCellWillUnmount={(arg) => {
            dayCellRefs.current.delete(formatYMD(arg.date));
          }}
          eventClick={(info) => {
            const props = info.event.extendedProps;
            if (props?.task_id) {
              openTaskDetail(props.task_id);
            }
          }}
          eventContent={(arg) => {
            return (
              <Tooltip title={getEventTooltip(arg.event)}>
                <div style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 12,
                  padding: '1px 4px',
                }}>
                  {arg.event.title}
                </div>
              </Tooltip>
            );
          }}
          schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
        />

        {workloadPopover && (
          <WorkloadPopover
            developerId={workloadPopover.developerId}
            developerName={workloadPopover.developerName}
            startDate={workloadPopover.startDate}
            endDate={workloadPopover.endDate}
            onClose={() => setWorkloadPopover(null)}
          />
        )}
      </div>

      {/* 右侧：全屏时显示未排期面板 */}
      {isFullscreen && (
        <UnscheduledTaskPanel
          onTaskAssigned={reloadEvents}
          onDragStart={handleExternalDragStart}
          onDragEnd={handleExternalDragEnd}
          pendingUnschedules={pendingMutations}
        />
      )}

      {/* 全屏批量保存工具栏 */}
      {isFullscreen && hasPending && (
        <div className="batch-save-bar">
          <Badge count={pendingUpdates.size} style={{ backgroundColor: '#fa8c16' }}>
            <span style={{ marginRight: 12, fontSize: 13 }}>待保存更改</span>
          </Badge>
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={handleBatchSave}
            loading={batchSaving}
          >
            保存
          </Button>
          <Button
            size="small"
            icon={<UndoOutlined />}
            onClick={handleBatchDiscard}
            disabled={batchSaving}
          >
            丢弃
          </Button>
        </div>
      )}
    </div>
  );
};
