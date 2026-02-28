import React, { useEffect, useState } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { calendarApi } from '../../lib/api';
import type { DeveloperWorkload } from '../../lib/types';

interface WorkloadPopoverProps {
  developerId: number;
  developerName: string;
  startDate: string;
  endDate: string;
  onClose: () => void;
}

const CHART_W = 320;
const CHART_H = 120;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 24;
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

export const WorkloadPopover: React.FC<WorkloadPopoverProps> = ({
  developerId,
  developerName,
  startDate,
  endDate,
  onClose,
}) => {
  const [workloads, setWorkloads] = useState<DeveloperWorkload[]>([]);

  useEffect(() => {
    calendarApi.getWorkload(developerId, startDate, endDate, true)
      .then(setWorkloads)
      .catch(() => {});
  }, [developerId, startDate, endDate]);

  // Auto close after 8s
  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (workloads.length === 0) return null;

  const maxHours = Math.max(8, ...workloads.map(w => Math.max(w.allocated_hours, w.max_hours)));
  const barW = Math.max(4, Math.min(16, PLOT_W / workloads.length - 2));
  const getX = (i: number) => PAD_L + (workloads.length > 1 ? (i / (workloads.length - 1)) * PLOT_W : PLOT_W / 2);
  const getY = (h: number) => PAD_T + PLOT_H - (h / maxHours) * PLOT_H;

  return (
    <div className="workload-popover">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{developerName} 近期负载</span>
        <CloseOutlined style={{ fontSize: 12, cursor: 'pointer', color: '#999' }} onClick={onClose} />
      </div>
      <svg width={CHART_W} height={CHART_H}>
        {/* Max hours reference line */}
        {workloads.length > 0 && (
          <line
            x1={PAD_L} y1={getY(workloads[0].max_hours)}
            x2={CHART_W - PAD_R} y2={getY(workloads[0].max_hours)}
            stroke="#1890ff" strokeWidth={1} strokeDasharray="4,3" opacity={0.6}
          />
        )}
        {/* Bars */}
        {workloads.map((w, i) => {
          const x = getX(i);
          const barH = (w.allocated_hours / maxHours) * PLOT_H;
          const isOverload = w.allocated_hours > w.max_hours;
          const nearFull = w.allocated_hours > w.max_hours * 0.8;
          const color = isOverload ? '#ff4d4f' : nearFull ? '#faad14' : '#52c41a';
          return (
            <Tooltip
              key={w.date}
              title={`${w.date}: ${w.allocated_hours.toFixed(1)}h / ${w.max_hours}h`}
            >
              <rect
                x={x - barW / 2}
                y={getY(w.allocated_hours)}
                width={barW}
                height={Math.max(barH, 1)}
                fill={color}
                rx={2}
                style={{ cursor: 'pointer' }}
              />
            </Tooltip>
          );
        })}
        {/* X-axis labels - show every Nth */}
        {workloads.map((w, i) => {
          const showEvery = workloads.length > 14 ? 3 : workloads.length > 7 ? 2 : 1;
          if (i % showEvery !== 0) return null;
          return (
            <text
              key={w.date}
              x={getX(i)}
              y={CHART_H - 4}
              textAnchor="middle"
              fontSize={9}
              fill="#999"
            >
              {w.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};
