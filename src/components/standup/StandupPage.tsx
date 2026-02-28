import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, DatePicker, Button, Input, Select, Tag, Avatar, Space, Typography,
  Spin, Empty, message, Popconfirm, Divider, Row, Col,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SaveOutlined,
  CloseOutlined, CheckCircleOutlined, AimOutlined, WarningOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useStandupStore } from '../../stores/standupStore';
import { useDeveloperStore } from '../../stores/developerStore';
import { useTaskStore } from '../../stores/taskStore';
import type {
  StandupItem, SaveStandupRequest, SaveEntryRequest, StandupEntry,
} from '../../lib/types';

const { TextArea } = Input;
const { Title, Text } = Typography;

interface EditEntryData {
  developer_id: number;
  done_items: StandupItem[];
  plan_items: StandupItem[];
  blockers: StandupItem[];
}

export const StandupPage: React.FC = () => {
  const { currentMeeting, loading, fetchMeeting, saveMeeting, deleteMeeting } = useStandupStore();
  const { developers, fetchDevelopers } = useDeveloperStore();
  const { tasks, fetchTasks } = useTaskStore();

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [editing, setEditing] = useState(false);
  const [editEntries, setEditEntries] = useState<EditEntryData[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load data on mount
  useEffect(() => {
    fetchDevelopers();
    fetchTasks();
  }, []);

  // Load meeting when date changes
  useEffect(() => {
    fetchMeeting(selectedDate.format('YYYY-MM-DD'));
  }, [selectedDate]);

  const activeDevelopers = developers.filter((d) => d.is_active);

  const taskOptions = tasks.map((t) => ({
    label: `${t.external_id ? t.external_id + ' - ' : ''}${t.name}`,
    value: t.id,
  }));

  // Enter edit mode
  const startEditing = useCallback(() => {
    if (currentMeeting) {
      // Pre-fill from existing meeting
      const entries: EditEntryData[] = activeDevelopers.map((dev) => {
        const existing = currentMeeting.entries.find((e) => e.developer_id === dev.id);
        if (existing) {
          return {
            developer_id: dev.id,
            done_items: [...existing.done_items],
            plan_items: [...existing.plan_items],
            blockers: [...existing.blockers],
          };
        }
        return createEmptyEntry(dev.id);
      });
      setEditEntries(entries);
      setEditNotes(currentMeeting.notes || '');
    } else {
      // Create new: auto-fill "plan" with in-progress tasks
      const entries: EditEntryData[] = activeDevelopers.map((dev) => {
        const entry = createEmptyEntry(dev.id);
        // Auto-fill plan_items with tasks that are in-progress for this developer
        const inProgressTasks = tasks.filter(
          (t) => t.owner_id === dev.id && t.status === '进行中'
        );
        entry.plan_items = inProgressTasks.map((t) => ({
          text: t.name,
          task_id: t.id,
        }));
        return entry;
      });
      setEditEntries(entries);
      setEditNotes('');
    }
    setEditing(true);
  }, [currentMeeting, activeDevelopers, tasks]);

  const cancelEditing = () => {
    setEditing(false);
  };

  const createEmptyEntry = (developerId: number): EditEntryData => ({
    developer_id: developerId,
    done_items: [],
    plan_items: [],
    blockers: [],
  });

  // Item manipulation helpers
  const addItem = (devIndex: number, field: 'done_items' | 'plan_items' | 'blockers') => {
    setEditEntries((prev) => {
      const next = [...prev];
      next[devIndex] = {
        ...next[devIndex],
        [field]: [...next[devIndex][field], { text: '', task_id: undefined }],
      };
      return next;
    });
  };

  const removeItem = (devIndex: number, field: 'done_items' | 'plan_items' | 'blockers', itemIndex: number) => {
    setEditEntries((prev) => {
      const next = [...prev];
      const items = [...next[devIndex][field]];
      items.splice(itemIndex, 1);
      next[devIndex] = { ...next[devIndex], [field]: items };
      return next;
    });
  };

  const updateItemText = (devIndex: number, field: 'done_items' | 'plan_items' | 'blockers', itemIndex: number, text: string) => {
    setEditEntries((prev) => {
      const next = [...prev];
      const items = [...next[devIndex][field]];
      items[itemIndex] = { ...items[itemIndex], text };
      next[devIndex] = { ...next[devIndex], [field]: items };
      return next;
    });
  };

  const updateItemTask = (devIndex: number, field: 'done_items' | 'plan_items' | 'blockers', itemIndex: number, taskId: number | undefined) => {
    setEditEntries((prev) => {
      const next = [...prev];
      const items = [...next[devIndex][field]];
      items[itemIndex] = { ...items[itemIndex], task_id: taskId };
      next[devIndex] = { ...next[devIndex], [field]: items };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out entries with no content
      const entries: SaveEntryRequest[] = editEntries
        .filter((e) =>
          e.done_items.some((i) => i.text.trim()) ||
          e.plan_items.some((i) => i.text.trim()) ||
          e.blockers.some((i) => i.text.trim())
        )
        .map((e) => ({
          developer_id: e.developer_id,
          done_items: e.done_items.filter((i) => i.text.trim()),
          plan_items: e.plan_items.filter((i) => i.text.trim()),
          blockers: e.blockers.filter((i) => i.text.trim()),
        }));

      const request: SaveStandupRequest = {
        meeting_date: selectedDate.format('YYYY-MM-DD'),
        notes: editNotes.trim() || undefined,
        entries,
      };

      await saveMeeting(request);
      message.success('早会记录已保存');
      setEditing(false);
    } catch (e) {
      message.error('保存失败: ' + String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentMeeting) return;
    try {
      await deleteMeeting(currentMeeting.id);
      message.success('早会记录已删除');
    } catch (e) {
      message.error('删除失败: ' + String(e));
    }
  };

  const getDevColor = (developerId: number): string => {
    const dev = developers.find((d) => d.id === developerId);
    return dev?.avatar_color || '#1890ff';
  };

  const getDevName = (developerId: number): string => {
    const dev = developers.find((d) => d.id === developerId);
    return dev?.name || '未知';
  };

  const getTaskName = (taskId: number): string => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return `任务#${taskId}`;
    return task.external_id ? `${task.external_id} - ${task.name}` : task.name;
  };

  // Render a single item list in view mode
  const renderViewItems = (items: StandupItem[]) => {
    if (!items || items.length === 0) {
      return <Text type="secondary" style={{ fontSize: 13 }}>无</Text>;
    }
    return (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((item, idx) => (
          <li key={idx} style={{ marginBottom: 4 }}>
            <Text>{item.text}</Text>
            {item.task_id && (
              <Tag color="blue" style={{ marginLeft: 8, cursor: 'pointer' }}>
                {getTaskName(item.task_id)}
              </Tag>
            )}
          </li>
        ))}
      </ul>
    );
  };

  // Render an entry card in view mode
  const renderViewEntry = (entry: StandupEntry) => {
    const color = getDevColor(entry.developer_id);
    return (
      <Card
        key={entry.id}
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <Avatar style={{ backgroundColor: color }} size="small">
              {entry.developer_name[0]}
            </Avatar>
            <Text strong>{entry.developer_name}</Text>
          </Space>
        }
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{
            borderLeft: '3px solid #52c41a',
            paddingLeft: 12,
            marginBottom: 8,
          }}>
            <Text strong style={{ color: '#52c41a' }}>
              <CheckCircleOutlined style={{ marginRight: 4 }} />
              昨日完成
            </Text>
            {renderViewItems(entry.done_items)}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{
            borderLeft: '3px solid #1890ff',
            paddingLeft: 12,
            marginBottom: 8,
          }}>
            <Text strong style={{ color: '#1890ff' }}>
              <AimOutlined style={{ marginRight: 4 }} />
              今日计划
            </Text>
            {renderViewItems(entry.plan_items)}
          </div>
        </div>
        <div>
          <div style={{
            borderLeft: '3px solid #fa8c16',
            paddingLeft: 12,
          }}>
            <Text strong style={{ color: '#fa8c16' }}>
              <WarningOutlined style={{ marginRight: 4 }} />
              问题/阻碍
            </Text>
            {renderViewItems(entry.blockers)}
          </div>
        </div>
      </Card>
    );
  };

  // Render edit section for items
  const renderEditItems = (
    devIndex: number,
    field: 'done_items' | 'plan_items' | 'blockers',
    label: string,
    color: string,
    icon: React.ReactNode,
  ) => {
    const items = editEntries[devIndex][field];
    return (
      <div style={{
        borderLeft: `3px solid ${color}`,
        paddingLeft: 12,
        marginBottom: 12,
      }}>
        <Text strong style={{ color, display: 'block', marginBottom: 8 }}>
          {icon} {label}
        </Text>
        {items.map((item, itemIndex) => (
          <Row key={itemIndex} gutter={8} style={{ marginBottom: 6 }} align="middle">
            <Col flex="auto">
              <Input
                placeholder="输入内容..."
                value={item.text}
                onChange={(e) => updateItemText(devIndex, field, itemIndex, e.target.value)}
                size="small"
              />
            </Col>
            <Col flex="200px">
              <Select
                placeholder="关联任务"
                allowClear
                showSearch
                optionFilterProp="label"
                options={taskOptions}
                value={item.task_id}
                onChange={(val) => updateItemTask(devIndex, field, itemIndex, val)}
                size="small"
                style={{ width: '100%' }}
              />
            </Col>
            <Col>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeItem(devIndex, field, itemIndex)}
              />
            </Col>
          </Row>
        ))}
        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => addItem(devIndex, field)}
          style={{ marginTop: 4 }}
        >
          添加
        </Button>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>早会记录</Title>
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            allowClear={false}
          />
        </Space>
        <Space>
          {!editing && (
            <>
              <Button
                type="primary"
                icon={currentMeeting ? <EditOutlined /> : <PlusOutlined />}
                onClick={startEditing}
              >
                {currentMeeting ? '编辑早会' : '新建今日早会'}
              </Button>
              {currentMeeting && (
                <Popconfirm
                  title="确定删除此早会记录？"
                  onConfirm={handleDelete}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </>
          )}
          {editing && (
            <>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存
              </Button>
              <Button icon={<CloseOutlined />} onClick={cancelEditing}>取消</Button>
            </>
          )}
        </Space>
      </div>

      <Spin spinning={loading}>
        {/* View Mode */}
        {!editing && (
          <>
            {currentMeeting ? (
              <>
                <Row gutter={16}>
                  {currentMeeting.entries.map((entry) => (
                    <Col key={entry.id} xs={24} sm={24} md={12} lg={8} xl={8}>
                      {renderViewEntry(entry)}
                    </Col>
                  ))}
                </Row>
                {currentMeeting.notes && (
                  <>
                    <Divider />
                    <Card size="small" title="会议备注">
                      <Text>{currentMeeting.notes}</Text>
                    </Card>
                  </>
                )}
              </>
            ) : (
              <Empty description={`${selectedDate.format('YYYY-MM-DD')} 暂无早会记录`} />
            )}
          </>
        )}

        {/* Edit Mode */}
        {editing && (
          <>
            {editEntries.map((entry, devIndex) => {
              const devName = getDevName(entry.developer_id);
              const devColor = getDevColor(entry.developer_id);
              return (
                <Card
                  key={entry.developer_id}
                  style={{ marginBottom: 16 }}
                  title={
                    <Space>
                      <Avatar style={{ backgroundColor: devColor }} size="small">
                        {devName[0]}
                      </Avatar>
                      <Text strong>{devName}</Text>
                    </Space>
                  }
                >
                  {renderEditItems(devIndex, 'done_items', '昨日完成', '#52c41a', <CheckCircleOutlined />)}
                  {renderEditItems(devIndex, 'plan_items', '今日计划', '#1890ff', <AimOutlined />)}
                  {renderEditItems(devIndex, 'blockers', '问题/阻碍', '#fa8c16', <WarningOutlined />)}
                </Card>
              );
            })}

            <Card size="small" title="会议备注" style={{ marginBottom: 16 }}>
              <TextArea
                rows={3}
                placeholder="输入会议备注..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </Card>
          </>
        )}
      </Spin>
    </div>
  );
};
