import React, { useEffect, useState, useMemo } from 'react';
import { Card, Typography, Select, Alert, Spin, Empty, Tag, Tooltip, DatePicker, Space, Button, Checkbox, message } from 'antd';
import { WarningOutlined, SyncOutlined } from '@ant-design/icons';
import { calendarApi } from '../../lib/api';
import { useDeveloperStore } from '../../stores/developerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTaskDetailStore } from '../../stores/taskDetailStore';
import type { DeveloperWorkload } from '../../lib/types';
import { formatHours } from '../../lib/formatHours';
import dayjs, { Dayjs } from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const DEV_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#f5222d', '#2f54eb'];

export const DeveloperSchedule: React.FC = () => {
  const { developers, fetchDevelopers } = useDeveloperStore();
  const workHoursConfig = useSettingsStore((s) => s.workHoursConfig);
  const { openTaskDetail } = useTaskDetailStore();
  const [selectedDevIds, setSelectedDevIds] = useState<number[]>([]);
  const [workloadMap, setWorkloadMap] = useState<Record<number, DeveloperWorkload[]>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [includeOvertime, setIncludeOvertime] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => {
    const today = dayjs();
    const startOfWeek = today.startOf('week'); // zh-cn locale: Monday
    return [startOfWeek, startOfWeek.add(27, 'day')];
  });

  useEffect(() => { fetchDevelopers(); }, []);

  useEffect(() => {
    if (selectedDevIds.length > 0) {
      loadWorkloads();
    } else {
      setWorkloadMap({});
    }
  }, [selectedDevIds, dateRange, includeOvertime]);

  const loadWorkloads = async () => {
    setLoading(true);
    try {
      const start = dateRange[0].format('YYYY-MM-DD');
      const end = dateRange[1].format('YYYY-MM-DD');
      const results: Record<number, DeveloperWorkload[]> = {};
      await Promise.all(
        selectedDevIds.map(async (devId) => {
          const data = await calendarApi.getWorkload(devId, start, end, includeOvertime);
          results[devId] = data;
        })
      );
      setWorkloadMap(results);
    } catch (e) {
      console.error('Failed to load workload:', e);
    } finally {
      setLoading(false);
    }
  };

  const allOverloadDays = useMemo(() => {
    const overloads: { devName: string; date: string; allocated: number; max: number }[] = [];
    for (const devId of selectedDevIds) {
      (workloadMap[devId] || []).forEach(w => {
        if (w.allocated_hours > w.max_hours) {
          overloads.push({ devName: w.developer_name, date: w.date, allocated: w.allocated_hours, max: w.max_hours });
        }
      });
    }
    return overloads;
  }, [workloadMap, selectedDevIds]);

  const isSingleMode = selectedDevIds.length === 1;
  const singleWorkloads = isSingleMode ? (workloadMap[selectedDevIds[0]] || []) : [];
  const singleDev = isSingleMode ? developers.find(d => d.id === selectedDevIds[0]) : null;

  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    Object.values(workloadMap).forEach(wl => wl.forEach(w => dateSet.add(w.date)));
    return Array.from(dateSet).sort();
  }, [workloadMap]);

  const maxBarHeight = 120;
  const maxHoursInChart = useMemo(() => {
    let max = 8;
    Object.values(workloadMap).forEach(workloads => {
      workloads.forEach(w => { max = Math.max(max, w.allocated_hours, w.max_hours); });
    });
    return max;
  }, [workloadMap]);

  const getDevColor = (devId: number) => DEV_COLORS[selectedDevIds.indexOf(devId) % DEV_COLORS.length];

  // SVG line chart dimensions
  const chartW = Math.max(allDates.length * 40, 600);
  const chartH = 200;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const getX = (i: number) => padL + (allDates.length > 1 ? (i / (allDates.length - 1)) * plotW : plotW / 2);
  const getY = (hours: number) => padT + plotH - (hours / maxHoursInChart) * plotH;

  const buildLinePath = (devId: number) => {
    const workloads = workloadMap[devId] || [];
    const points = allDates.map((date, i) => {
      const w = workloads.find(wl => wl.date === date);
      const hours = w?.allocated_hours || 0;
      return `${getX(i)},${getY(hours)}`;
    });
    return `M${points.join('L')}`;
  };

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const ticks = [];
    const step = maxHoursInChart <= 4 ? 1 : maxHoursInChart <= 10 ? 2 : Math.ceil(maxHoursInChart / 5);
    for (let v = 0; v <= maxHoursInChart; v += step) {
      ticks.push(v);
    }
    return ticks;
  }, [maxHoursInChart]);

  const handleSyncHolidays = async () => {
    setSyncing(true);
    try {
      const startYear = dateRange[0].year();
      const endYear = dateRange[1].year();
      const years = new Set<number>();
      for (let y = startYear; y <= endYear; y++) years.add(y);
      let total = 0;
      for (const year of years) {
        const count = await calendarApi.syncHolidays(year);
        total += count;
      }
      message.success(`已同步 ${total} 条节假日数据`);
      if (selectedDevIds.length > 0) loadWorkloads();
    } catch (e) {
      message.error('同步节假日失败: ' + String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>个人日程</Title>
        <Space wrap>
          <Button
            icon={<SyncOutlined spin={syncing} />}
            loading={syncing}
            onClick={handleSyncHolidays}
            title="从在线API同步中国节假日和调休补班数据"
          >
            同步节假日
          </Button>
          <Checkbox
            checked={includeOvertime}
            onChange={(e) => setIncludeOvertime(e.target.checked)}
          >
            统计加班日
          </Checkbox>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) setDateRange([dates[0], dates[1]]);
            }}
          />
          <Select
            mode="multiple"
            style={{ minWidth: 200, maxWidth: 400 }}
            placeholder="选择成员（支持多选）"
            value={selectedDevIds}
            onChange={setSelectedDevIds}
            options={developers.map(d => ({ label: d.name, value: d.id }))}
            maxTagCount={3}
            maxTagPlaceholder={(omitted) => `+${omitted.length}人`}
          />
        </Space>
      </div>

      {selectedDevIds.length === 0 && <Empty description="请选择一位或多位成员查看日程" />}

      {selectedDevIds.length > 0 && loading && (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      )}

      {selectedDevIds.length > 0 && !loading && (
        <>
          {allOverloadDays.length > 0 && (
            <Alert
              type="warning"
              icon={<WarningOutlined />}
              showIcon
              message={`超负荷预警: ${allOverloadDays.length} 天超出最大工时`}
              description={
                <div style={{ maxHeight: 100, overflow: 'auto' }}>
                  {allOverloadDays.slice(0, 20).map((d, i) =>
                    <div key={i}>{d.devName} - {d.date}: 已分配 {formatHours(d.allocated, workHoursConfig)} / 最大 {formatHours(d.max, workHoursConfig)}</div>
                  )}
                  {allOverloadDays.length > 20 && <div>...还有 {allOverloadDays.length - 20} 天</div>}
                </div>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Single person info card */}
          {isSingleMode && singleDev && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text strong>{singleDev.name}</Text>
                <div>{singleDev.roles.map(r => <Tag key={r} color="blue">{r}</Tag>)}</div>
                <Text type="secondary">每日最大工时: {formatHours(singleDev.max_hours_per_day, workHoursConfig)}</Text>
                <Text type="secondary">
                  总已分配: {formatHours(singleWorkloads.reduce((sum, w) => sum + w.allocated_hours, 0), workHoursConfig)}
                </Text>
              </div>
            </Card>
          )}

          {/* Multi person legend */}
          {!isSingleMode && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space wrap>
                {selectedDevIds.map(devId => {
                  const dev = developers.find(d => d.id === devId);
                  const workloads = workloadMap[devId] || [];
                  const total = workloads.reduce((sum, w) => sum + w.allocated_hours, 0);
                  return <Tag key={devId} color={getDevColor(devId)}>{dev?.name}: {formatHours(total, workHoursConfig)}</Tag>;
                })}
                <Tag style={{ borderStyle: 'dashed', color: '#ff4d4f', borderColor: '#ff4d4f', background: 'transparent' }}>- - 最大工时线</Tag>
              </Space>
            </Card>
          )}

          <Card title={isSingleMode ? '工作量分布' : '多人工作量趋势对比'} size="small">
            {allDates.length === 0 ? (
              <Empty description="该时间段内无任务分配" />
            ) : isSingleMode ? (
              /* Single person bar chart - kept as is */
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, minWidth: singleWorkloads.length * 36, height: maxBarHeight + 40 }}>
                  {singleWorkloads.map((w) => {
                    const barH = (w.allocated_hours / maxHoursInChart) * maxBarHeight;
                    const limitH = (w.max_hours / maxHoursInChart) * maxBarHeight;
                    const isOverload = w.allocated_hours > w.max_hours;
                    const isOvertimeDay = w.is_overtime;
                    const isWeekend = !isOvertimeDay && (new Date(w.date).getDay() === 0 || new Date(w.date).getDay() === 6);
                    const dayLabel = w.date.slice(5);
                    const barColor = isOvertimeDay ? '#fa8c16' : isOverload ? '#ff4d4f' : w.allocated_hours > w.max_hours * 0.8 ? '#faad14' : '#52c41a';
                    return (
                      <Tooltip
                        key={w.date}
                        title={
                          <div>
                            <div>{w.date} ({['日','一','二','三','四','五','六'][new Date(w.date).getDay()]}){isOvertimeDay ? ' 🔶加班' : ''}</div>
                            <div>已分配: {formatHours(w.allocated_hours, workHoursConfig)}</div>
                            <div>最大工时: {formatHours(w.max_hours, workHoursConfig)}</div>
                            <div>剩余: {formatHours(w.available_hours, workHoursConfig)}</div>
                            {w.tasks.length > 0 && (
                              <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 4 }}>
                                {w.tasks.map(t => <div key={t.task_id}><span style={{ cursor: 'pointer' }} className="task-name-link" onClick={() => openTaskDetail(t.task_id)}>{t.task_name}</span>: {formatHours(t.daily_hours, workHoursConfig)}</div>)}
                              </div>
                            )}
                          </div>
                        }
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32 }}>
                          <div style={{ position: 'relative', height: maxBarHeight, display: 'flex', alignItems: 'flex-end' }}>
                            {isOvertimeDay && (
                              <svg style={{ position: 'absolute', top: 0, left: 0, width: 24, height: '100%', pointerEvents: 'none' }}>
                                <defs>
                                  <pattern id={`overtime-${w.date}`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                                    <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(250,140,22,0.15)" strokeWidth="3" />
                                  </pattern>
                                </defs>
                                <rect width="24" height="100%" fill={`url(#overtime-${w.date})`} />
                              </svg>
                            )}
                            <div style={{
                              width: 24,
                              height: Math.max(barH, 2),
                              backgroundColor: barColor,
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.3s',
                            }} />
                            {!isWeekend && (
                              <div style={{
                                position: 'absolute', bottom: limitH, left: -2, width: 28, height: 2,
                                backgroundColor: '#1890ff', opacity: 0.6,
                              }} />
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: isOvertimeDay ? '#fa8c16' : isWeekend ? '#bbb' : '#666', marginTop: 4, whiteSpace: 'nowrap', fontWeight: isOvertimeDay ? 600 : 400 }}>
                            {dayLabel}
                          </div>
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: '#999' }}>
                  <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#52c41a', borderRadius: 2, marginRight: 4, verticalAlign: -1 }} />正常</span>
                  <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#faad14', borderRadius: 2, marginRight: 4, verticalAlign: -1 }} />接近上限</span>
                  <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#ff4d4f', borderRadius: 2, marginRight: 4, verticalAlign: -1 }} />超负荷</span>
                  {includeOvertime && <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#fa8c16', borderRadius: 2, marginRight: 4, verticalAlign: -1 }} />加班日</span>}
                  <span><span style={{ display: 'inline-block', width: 28, height: 2, backgroundColor: '#1890ff', marginRight: 4, verticalAlign: 3 }} />最大工时线</span>
                </div>
              </div>
            ) : (
              /* Multi person SVG line chart */
              <div style={{ overflowX: 'auto' }}>
                <svg width={chartW} height={chartH} style={{ display: 'block' }}>
                  {/* Grid lines */}
                  {yTicks.map(v => (
                    <g key={v}>
                      <line x1={padL} y1={getY(v)} x2={chartW - padR} y2={getY(v)} stroke="#f0f0f0" strokeWidth={1} />
                      <text x={padL - 6} y={getY(v) + 4} textAnchor="end" fontSize={10} fill="#999">{v}h</text>
                    </g>
                  ))}

                  {/* Max hours reference line (dashed) */}
                  {(() => {
                    const firstDev = selectedDevIds[0];
                    const wl = workloadMap[firstDev] || [];
                    const maxH = wl.length > 0 ? wl[0].max_hours : 8;
                    return (
                      <line
                        x1={padL} y1={getY(maxH)} x2={chartW - padR} y2={getY(maxH)}
                        stroke="#ff4d4f" strokeWidth={1.5} strokeDasharray="6,4"
                      />
                    );
                  })()}

                  {/* Weekend / overtime shading */}
                  {allDates.map((date, i) => {
                    const isOvertimeDay = Object.values(workloadMap).some(wl => wl.find(w => w.date === date && w.is_overtime));
                    const day = new Date(date).getDay();
                    if (isOvertimeDay) {
                      const x = getX(i);
                      return <rect key={date} x={x - 12} y={padT} width={24} height={plotH} fill="rgba(250,140,22,0.12)" />;
                    }
                    if (day === 0 || day === 6) {
                      const x = getX(i);
                      return <rect key={date} x={x - 12} y={padT} width={24} height={plotH} fill="#f5f5f5" />;
                    }
                    return null;
                  })}

                  {/* Lines for each developer */}
                  {selectedDevIds.map(devId => (
                    <path
                      key={devId}
                      d={buildLinePath(devId)}
                      fill="none"
                      stroke={getDevColor(devId)}
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  ))}

                  {/* Data points with tooltips */}
                  {selectedDevIds.map(devId => {
                    const workloads = workloadMap[devId] || [];
                    const dev = developers.find(d => d.id === devId);
                    return allDates.map((date, i) => {
                      const w = workloads.find(wl => wl.date === date);
                      const hours = w?.allocated_hours || 0;
                      return (
                        <Tooltip
                          key={`${devId}-${date}`}
                          title={
                            <div>
                              <div style={{ fontWeight: 600 }}>{dev?.name} - {date}{w?.is_overtime ? ' 🔶加班' : ''}</div>
                              <div>已分配: {formatHours(hours, workHoursConfig)}</div>
                              {w && <div>最大: {formatHours(w.max_hours, workHoursConfig)} / 剩余: {formatHours(w.available_hours, workHoursConfig)}</div>}
                              {w && w.tasks.length > 0 && (
                                <div style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: 4 }}>
                                  {w.tasks.map(t => <div key={t.task_id}><span style={{ cursor: 'pointer' }} className="task-name-link" onClick={() => openTaskDetail(t.task_id)}>{t.task_name}</span>: {formatHours(t.daily_hours, workHoursConfig)}</div>)}
                                </div>
                              )}
                            </div>
                          }
                        >
                          <circle
                            cx={getX(i)}
                            cy={getY(hours)}
                            r={4}
                            fill={getDevColor(devId)}
                            stroke="#fff"
                            strokeWidth={1.5}
                            style={{ cursor: 'pointer' }}
                          />
                        </Tooltip>
                      );
                    });
                  })}

                  {/* X-axis date labels */}
                  {allDates.map((date, i) => {
                    // Show every Nth label to avoid crowding
                    const showEvery = allDates.length > 28 ? 7 : allDates.length > 14 ? 3 : allDates.length > 7 ? 2 : 1;
                    if (i % showEvery !== 0) return null;
                    const isOvertimeDay = Object.values(workloadMap).some(wl => wl.find(w => w.date === date && w.is_overtime));
                    const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                    return (
                      <text
                        key={date}
                        x={getX(i)}
                        y={chartH - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill={isOvertimeDay ? '#fa8c16' : isWeekend ? '#bbb' : '#666'}
                        fontWeight={isOvertimeDay ? 600 : 400}
                      >
                        {date.slice(5)}
                      </text>
                    );
                  })}
                </svg>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
