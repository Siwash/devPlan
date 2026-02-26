import React from 'react';
import { Tag } from 'antd';
import { STATUS_COLORS, PRIORITY_COLORS, TASK_TYPE_COLORS } from '../../lib/types';

export const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return null;
  return <Tag color={STATUS_COLORS[status] || '#d9d9d9'}>{status}</Tag>;
};

export const PriorityBadge: React.FC<{ priority?: string }> = ({ priority }) => {
  if (!priority) return null;
  return <Tag color={PRIORITY_COLORS[priority] || '#1890ff'}>{priority}</Tag>;
};

export const TaskTypeBadge: React.FC<{ taskType?: string }> = ({ taskType }) => {
  if (!taskType) return null;
  return <Tag color={TASK_TYPE_COLORS[taskType] || '#1890ff'}>{taskType}</Tag>;
};
