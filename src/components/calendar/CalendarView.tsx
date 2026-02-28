import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import { Select, Typography, Space, Tooltip, Segmented, Tag, message } from 'antd';
import { calendarApi, taskApi } from '../../lib/api';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import { useTaskDetailStore } from '../../stores/taskDetailStore';
import type { CalendarEvent, CalendarResource, CalendarEventExtProps, UpdateTaskDto, DeveloperWorkload } from '../../lib/types';
import { TASK_TYPE_COLORS } from '../../lib/types';
import { WorkloadPopover } from './WorkloadPopover';
import { QuickTaskInput } from './QuickTaskInput';

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

// ─── Component ───────────────────────────────────────────

export const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [selectedDev, setSelectedDev] = useState<number | undefined>(undefined);
  const [dimension, setDimension] = useState<Dimension>('task');
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { sprints, fetchSprints } = useSprintStore();
  const { openTaskDetail } = useTaskDetailStore();
  const calendarRef = useRef<FullCalendar>(null);

  // ── 缓存：记录当前可见日期范围 ──
  const visibleRangeRef = useRef<{ start: string; end: string }>({ start: '', end: '' });

  // ── 缓存：负载数据缓存 (developerId → workloads) ──
  const workloadCacheRef = useRef<Map<number, DeveloperWorkload[]>>(new Map());
  const workloadLoadingRef = useRef<Set<number>>(new Set());

  // ── 缓存：dayCellDidMount DOM引用 ──
  const dayCellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ── debounce reload ──
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 负载迷你图弹层状态 ──
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
      const evts = await calendarApi.getEvents(startDate, endDate, selectedDev);
      setEvents(evts.map(e => ({
        ...e,
        resourceId: e.resource_id,
        extendedProps: e.ext_props,
      })));
    } catch (e) {
      console.error('Failed to load events:', e);
    }
  }, [selectedDev]);

  /** Debounced reload — 连续拖拽时只在最后一次操作 300ms 后刷新 */
  const reloadEvents = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      const { start, end } = visibleRangeRef.current;
      if (start && end) {
        loadEvents(start, end);
        // 拖拽改了数据，负载缓存也需要清除
        workloadCacheRef.current.clear();
      }
    }, 300);
  }, [loadEvents]);

  const handleDatesSet = useCallback((info: { startStr: string; endStr: string }) => {
    const start = info.startStr.split('T')[0];
    const end = info.endStr.split('T')[0];
    visibleRangeRef.current = { start, end };
    loadEvents(start, end);
    // 日期范围变了，负载缓存失效
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
  }, [selectedDev, loadEvents]);

  // ── 负载缓存加载（供拖拽热力图使用）──
  const loadWorkloadCached = useCallback(async (developerId: number): Promise<DeveloperWorkload[]> => {
    // 已缓存直接返回
    const cached = workloadCacheRef.current.get(developerId);
    if (cached) return cached;

    // 正在加载，等一下
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

  // ── 拖拽热力图着色/清除 ──
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

  // ── 显示负载迷你图 ──
  const showWorkloadPopover = useCallback((ownerId: number, ownerName: string) => {
    const { start, end } = visibleRangeRef.current;
    if (!start || !end) return;
    setWorkloadPopover({ developerId: ownerId, developerName: ownerName, startDate: start, endDate: end });
  }, []);

  // ── eventDrop 处理器（拖拽日期 + 换人）──
  const handleEventDrop = useCallback(async (info: any) => {
    const props = info.event.extendedProps;
    const taskId = props?.task_id;
    if (!taskId) { info.revert(); return; }

    const dto: UpdateTaskDto = {
      id: taskId,
      planned_start: formatYMD(info.event.start!),
      planned_end: fcToBackendDate(info.event.end, info.event.start!),
    };

    // 资源换人（resource-timeline 拖到不同行）
    let ownerId = props?.owner_id;
    let ownerName = props?.owner_name || '';
    if (info.newResource) {
      const newOwnerId = parseInt(info.newResource.id);
      dto.owner_id = newOwnerId;
      ownerId = newOwnerId;
      ownerName = info.newResource.title || ownerName;
    }

    try {
      await taskApi.update(dto);
      message.success('任务已更新');
      // 乐观更新成功 → 安排后台 debounced reload
      reloadEvents();
      // 弹出负载迷你图
      if (ownerId) showWorkloadPopover(ownerId, ownerName);
    } catch (e) {
      info.revert();
      message.error('更新失败: ' + String(e));
    }
  }, [reloadEvents, showWorkloadPopover]);

  // ── eventResize 处理器（拖拽调整时长）──
  const handleEventResize = useCallback(async (info: any) => {
    const props = info.event.extendedProps;
    const taskId = props?.task_id;
    if (!taskId) { info.revert(); return; }

    const dto: UpdateTaskDto = {
      id: taskId,
      planned_start: formatYMD(info.event.start!),
      planned_end: fcToBackendDate(info.event.end, info.event.start!),
    };

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
  }, [reloadEvents, showWorkloadPopover]);

  // ── eventDragStart：加载并着色热力图 ──
  const handleEventDragStart = useCallback((info: any) => {
    const ownerId = info.event.extendedProps?.owner_id;
    const taskId = info.event.extendedProps?.task_id;
    if (!ownerId || !taskId) return;
    loadWorkloadCached(ownerId).then(workloads => {
      applyHeatmap(workloads, taskId);
    });
  }, [loadWorkloadCached, applyHeatmap]);

  // ── eventDragStop：清除热力图 ──
  const handleEventDragStop = useCallback(() => {
    clearHeatmap();
  }, [clearHeatmap]);

  const getSprintColor = (sprintId: number) => SPRINT_COLORS[sprintId % SPRINT_COLORS.length];

  // Transform events based on dimension
  const displayEvents = useMemo(() => {
    return events.map(evt => {
      const props = (evt.extendedProps || evt.ext_props || {}) as CalendarEventExtProps;
      let color = evt.color;

      if (dimension === 'task') {
        const taskType = props.task_type || '';
        color = TASK_TYPE_COLORS[taskType] || '#1890ff';
      } else if (dimension === 'person') {
        const ownerName = props.owner_name || '';
        const dev = developers.find(d => d.name === ownerName);
        color = dev?.avatar_color || '#1890ff';
      } else if (dimension === 'sprint') {
        const sprintName = props.sprint_name || '';
        const sprint = sprints.find(s => s.name === sprintName);
        color = sprint ? getSprintColor(sprint.id) : '#d9d9d9';
      }

      let resourceId = evt.resourceId || evt.resource_id;
      if (dimension === 'sprint') {
        const sprintName = props.sprint_name || '';
        const sprint = sprints.find(s => s.name === sprintName);
        resourceId = sprint ? `sprint-${sprint.id}` : 'no-sprint';
      }

      return { ...evt, color, resourceId };
    });
  }, [events, dimension, developers, sprints]);

  // Transform resources based on dimension
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

  // Build legend items based on current dimension
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
    <div>
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
            placeholder="全部成员"
            allowClear
            style={{ width: 150 }}
            value={selectedDev}
            onChange={setSelectedDev}
            options={developers.map(d => ({ label: d.name, value: d.id }))}
          />
        </Space>
      </div>

      {/* Color legend */}
      {legendItems.length > 0 && (
        <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {legendItems.map(item => (
            <Tag key={item.label} color={item.color} style={{ margin: 0 }}>
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
        height="auto"
        events={displayEvents as any}
        resources={displayResources}
        datesSet={handleDatesSet}
        editable={true}
        eventResourceEditable={true}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
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

      {/* 拖拽后负载迷你图 */}
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
  );
};
