import React, { useEffect, useState, useRef, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import { Select, Typography, Space, Tooltip, Segmented, Tag } from 'antd';
import { calendarApi } from '../../lib/api';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSprintStore } from '../../stores/sprintStore';
import type { CalendarEvent, CalendarResource, CalendarEventExtProps } from '../../lib/types';
import { TASK_TYPE_COLORS } from '../../lib/types';

const { Title } = Typography;

type Dimension = 'task' | 'person' | 'sprint';

const SPRINT_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#2f54eb', '#a0d911', '#faad14'];

export const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [resources, setResources] = useState<CalendarResource[]>([]);
  const [selectedDev, setSelectedDev] = useState<number | undefined>(undefined);
  const [dimension, setDimension] = useState<Dimension>('task');
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { sprints, fetchSprints } = useSprintStore();
  const calendarRef = useRef<FullCalendar>(null);

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

  const loadEvents = async (startDate: string, endDate: string) => {
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
  };

  const handleDatesSet = (info: { startStr: string; endStr: string }) => {
    loadEvents(info.startStr.split('T')[0], info.endStr.split('T')[0]);
  };

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) {
      const start = api.view.activeStart.toISOString().split('T')[0];
      const end = api.view.activeEnd.toISOString().split('T')[0];
      loadEvents(start, end);
    }
  }, [selectedDev]);

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
      // Collect task types actually in use
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
      // Collect owners in use
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
      // Sprint
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
        eventClick={(info) => {
          const props = info.event.extendedProps;
          console.log('Task clicked:', props);
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
    </div>
  );
};
