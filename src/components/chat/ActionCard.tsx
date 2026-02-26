import React from 'react';
import { Card, Tag, Button, Space } from 'antd';
import { ThunderboltOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ChatAction } from '../../lib/types';

interface ActionCardProps {
  action: ChatAction;
  onApply: () => void;
  applying: boolean;
}

const ACTION_TYPE_MAP: Record<string, { color: string; label: string }> = {
  create_task: { color: 'green', label: '创建任务' },
  update_task: { color: 'blue', label: '更新任务' },
  delete_task: { color: 'red', label: '删除任务' },
  batch_update: { color: 'orange', label: '批量更新' },
  batch_create: { color: 'green', label: '批量创建' },
  batch_delete: { color: 'red', label: '批量删除' },
  schedule: { color: 'purple', label: '排期建议' },
};

export const ActionCard: React.FC<ActionCardProps> = ({ action, onApply, applying }) => {
  const info = ACTION_TYPE_MAP[action.action_type] ?? { color: 'default', label: action.action_type };

  return (
    <Card
      size="small"
      style={{
        marginTop: 8,
        borderRadius: 10,
        borderColor: '#e8e8e8',
      }}
      styles={{ body: { padding: '10px 14px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space size={8}>
          <Tag color={info.color} style={{ margin: 0 }}>{info.label}</Tag>
          {action.requires_confirmation && (
            <Tag color="warning" style={{ margin: 0 }}>需确认</Tag>
          )}
          <span style={{ fontSize: 13, color: 'rgba(0, 0, 0, 0.65)' }}>
            {action.description}
          </span>
        </Space>
        <Button
          type="primary"
          size="small"
          icon={applying ? <LoadingOutlined /> : <ThunderboltOutlined />}
          onClick={onApply}
          disabled={applying}
          style={{ borderRadius: 6 }}
        >
          {applying ? '执行中' : '应用'}
        </Button>
      </div>
    </Card>
  );
};
