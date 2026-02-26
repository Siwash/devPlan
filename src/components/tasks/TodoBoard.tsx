import React, { useEffect, useState, useMemo } from 'react';
import { Typography, Select, DatePicker, Segmented, Card, Tag, Space, Empty, Spin, Avatar, List, Tooltip, Badge } from 'antd';
import { ClockCircleOutlined, UserOutlined } from '@ant-design/icons';
import { useTaskStore } from '../../stores/taskStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { STATUS_COLORS, TASK_TYPE_COLORS, PRIORITY_COLORS } from '../../lib/types';
import type { Task } from '../../lib/types';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;

type ViewMode = 'day' | 'week';

export const TodoBoard: React.FC = () => {
  const { tasks, loading, fetchTasks } = useTaskStore();
  const { developers, fetchDevelopers } = useDeveloperStore();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedDevIds, setSelectedDevIds] = useState<number[]>([]);

  useEffect(() => {
    fetchDevelopers();
  }, []);

  useEffect(() => {
    fetchTasks({});
  }, []);

  // Date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === 'day') {
      const d = selectedDate.format('YYYY-MM-DD');
      return { start: d, end: d };
    }
    const startOfWeek = selectedDate.startOf('week').add(1, 'day'); // Monday
    const endOfWeek = startOfWeek.add(4, 'day'); // Friday
    return {
      start: startOfWeek.format('YYYY-MM-DD'),
      end: endOfWeek.format('YYYY-MM-DD'),
    };
  }, [viewMode, selectedDate]);

  // Filter tasks that overlap with date range
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Must have date info
      if (!t.planned_start || !t.planned_end) return false;
      // Must be non-completed/cancelled (or show all that overlap)
      // Date overlap check
      const taskStart = t.planned_start;
      const taskEnd = t.planned_end;
      if (taskStart > dateRange.end || taskEnd < dateRange.start) return false;
      // Filter by selected developers
      if (selectedDevIds.length > 0 && t.owner_id && !selectedDevIds.includes(t.owner_id)) return false;
      return true;
    });
  }, [tasks, dateRange, selectedDevIds]);

  // Group tasks by owner
  const tasksByOwner = useMemo(() => {
    const groups: Record<string, { dev: { id: number; name: string; avatar_color: string } | null; tasks: Task[] }> = {};
    filteredTasks.forEach(t => {
      const key = t.owner_name || '未分配';
      if (!groups[key]) {
        const dev = developers.find(d => d.name === t.owner_name);
        groups[key] = {
          dev: dev ? { id: dev.id, name: dev.name, avatar_color: dev.avatar_color } : null,
          tasks: [],
        };
      }
      groups[key].tasks.push(t);
    });
    // Sort by name
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks, developers]);

  // Generate week day headers
  const weekDays = useMemo(() => {
    if (viewMode !== 'week') return [];
    const days = [];
    const start = dayjs(dateRange.start);
    for (let i = 0; i < 5; i++) {
      const d = start.add(i, 'day');
      days.push({
        date: d.format('YYYY-MM-DD'),
        label: d.format('MM/DD'),
        weekday: ['一', '二', '三', '四', '五'][i],
        isToday: d.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD'),
      });
    }
    return days;
  }, [viewMode, dateRange]);

  const getStatusLabel = (status?: string) => {
    if (!status) return '未知';
    return status;
  };

  const getStatusTag = (status?: string) => {
    const color = STATUS_COLORS[status || ''] || '#d9d9d9';
    return <Tag color={color} style={{ margin: 0 }}>{getStatusLabel(status)}</Tag>;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          待办任务
          <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
            {filteredTasks.length} 项
          </Text>
        </Title>
        <Space wrap>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: '日视图', value: 'day' },
              { label: '周视图', value: 'week' },
            ]}
          />
          <DatePicker
            value={selectedDate}
            onChange={(d) => d && setSelectedDate(d)}
            picker={viewMode === 'week' ? 'week' : 'date'}
          />
          <Select
            mode="multiple"
            style={{ minWidth: 180, maxWidth: 360 }}
            placeholder="筛选成员"
            value={selectedDevIds}
            onChange={setSelectedDevIds}
            options={developers.map(d => ({ label: d.name, value: d.id }))}
            allowClear
            maxTagCount={2}
            maxTagPlaceholder={(omitted) => `+${omitted.length}`}
          />
        </Space>
      </div>

      {/* Date info bar */}
      <div style={{ marginBottom: 16, padding: '8px 16px', background: '#fafafa', borderRadius: 8, fontSize: 13, color: '#666' }}>
        {viewMode === 'day'
          ? `${selectedDate.format('YYYY年MM月DD日')} ${['日','一','二','三','四','五','六'][selectedDate.day()]}`
          : `${dateRange.start} ~ ${dateRange.end} (周一 ~ 周五)`
        }
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      )}

      {!loading && filteredTasks.length === 0 && (
        <Empty description="该时间段内无待办任务" />
      )}

      {!loading && filteredTasks.length > 0 && viewMode === 'day' && (
        /* Day view: grouped by owner */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tasksByOwner.map(([ownerName, group]) => (
            <Card
              key={ownerName}
              size="small"
              title={
                <Space>
                  <Avatar
                    size="small"
                    style={{ backgroundColor: group.dev?.avatar_color || '#1890ff' }}
                    icon={<UserOutlined />}
                  >
                    {ownerName[0]}
                  </Avatar>
                  <span>{ownerName}</span>
                  <Badge count={group.tasks.length} style={{ backgroundColor: '#1890ff' }} />
                </Space>
              }
            >
              <List
                size="small"
                dataSource={group.tasks}
                renderItem={(task) => (
                  <List.Item
                    style={{ padding: '6px 0' }}
                    actions={[
                      getStatusTag(task.status),
                      task.planned_hours ? (
                        <Tooltip title="计划工时">
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined /> {task.planned_hours}h
                          </Text>
                        </Tooltip>
                      ) : null,
                    ].filter(Boolean)}
                  >
                    <List.Item.Meta
                      title={
                        <Space size={4}>
                          {task.task_type && (
                            <Tag color={TASK_TYPE_COLORS[task.task_type] || '#1890ff'} style={{ margin: 0, fontSize: 11 }}>
                              {task.task_type}
                            </Tag>
                          )}
                          {task.priority && (
                            <Tag color={PRIORITY_COLORS[task.priority] || '#d9d9d9'} style={{ margin: 0, fontSize: 11 }}>
                              {task.priority}
                            </Tag>
                          )}
                          <Text style={{ fontSize: 13 }}>{task.name}</Text>
                        </Space>
                      }
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {task.external_id && `${task.external_id} | `}
                          {task.planned_start} ~ {task.planned_end}
                          {task.sprint_name && ` | ${task.sprint_name}`}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          ))}
        </div>
      )}

      {!loading && filteredTasks.length > 0 && viewMode === 'week' && (
        /* Week view: columns per day */
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {weekDays.map(day => {
            const dayTasks = filteredTasks.filter(t => {
              return t.planned_start! <= day.date && t.planned_end! >= day.date;
            });
            return (
              <div
                key={day.date}
                style={{
                  flex: '1 1 0',
                  minWidth: 200,
                  background: day.isToday ? '#e6f7ff' : '#fafafa',
                  borderRadius: 8,
                  padding: 8,
                  border: day.isToday ? '2px solid #1890ff' : '1px solid #f0f0f0',
                }}
              >
                <div style={{
                  textAlign: 'center',
                  fontWeight: 600,
                  marginBottom: 8,
                  color: day.isToday ? '#1890ff' : '#333',
                }}>
                  <div style={{ fontSize: 12 }}>周{day.weekday}</div>
                  <div>{day.label}</div>
                  <Badge count={dayTasks.length} style={{ backgroundColor: day.isToday ? '#1890ff' : '#999' }} />
                </div>
                {dayTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#ccc', padding: 20, fontSize: 12 }}>无任务</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {dayTasks.map(task => (
                      <Tooltip
                        key={task.id}
                        title={
                          <div>
                            <div>{task.name}</div>
                            <div>负责人: {task.owner_name || '未分配'}</div>
                            <div>状态: {task.status}</div>
                            <div>{task.planned_start} ~ {task.planned_end}</div>
                            {task.planned_hours && <div>工时: {task.planned_hours}h</div>}
                          </div>
                        }
                      >
                        <div style={{
                          padding: '4px 8px',
                          borderRadius: 4,
                          borderLeft: `3px solid ${TASK_TYPE_COLORS[task.task_type || ''] || '#1890ff'}`,
                          background: '#fff',
                          fontSize: 12,
                          overflow: 'hidden',
                        }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                            {task.name}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}>{task.owner_name || '-'}</Text>
                            {getStatusTag(task.status)}
                          </div>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
