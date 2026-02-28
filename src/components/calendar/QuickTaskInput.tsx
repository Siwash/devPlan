import React, { useState } from 'react';
import { Input, Button, Alert, Space, Spin, message, Tooltip } from 'antd';
import { RobotOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { llmApi } from '../../lib/api';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ChatAction } from '../../lib/types';

interface QuickTaskInputProps {
  onTaskCreated: () => void;
}

export const QuickTaskInput: React.FC<QuickTaskInputProps> = ({ onTaskCreated }) => {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedAction, setParsedAction] = useState<ChatAction | null>(null);
  const [parsedMessage, setParsedMessage] = useState('');
  const llmConfig = useSettingsStore((s) => s.llmConfig);

  const handleParse = async () => {
    if (!input.trim()) return;

    if (!llmConfig?.api_key) {
      message.warning('请先在设置中配置 AI');
      return;
    }

    setLoading(true);
    setParsedAction(null);

    try {
      const resp = await llmApi.chat(`创建任务: ${input}`, []);
      const createAction = resp.actions.find(
        (a) => a.action_type === 'batch_create' || a.action_type === 'create_task'
      );

      if (createAction) {
        setParsedAction(createAction);
        setParsedMessage(resp.message);
      } else {
        message.info(resp.message || '未能解析出创建任务的操作');
      }
    } catch (e) {
      message.error('AI 解析失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedAction) return;
    setLoading(true);
    try {
      await llmApi.executeAction(parsedAction);
      message.success('任务创建成功');
      setParsedAction(null);
      setInput('');
      setExpanded(false);
      onTaskCreated();
    } catch (e) {
      message.error('创建失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setParsedAction(null);
    setParsedMessage('');
  };

  if (!expanded) {
    return (
      <Tooltip title="AI 快速建任务">
        <Button
          icon={<RobotOutlined />}
          onClick={() => {
            if (!llmConfig?.api_key) {
              message.warning('请先在设置中配置 AI');
              return;
            }
            setExpanded(true);
          }}
          size="small"
        />
      </Tooltip>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Space.Compact style={{ width: 360 }}>
        <Input
          placeholder="如: 张三下周开发登录功能3天"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={handleParse}
          disabled={loading}
          size="small"
          prefix={<RobotOutlined style={{ color: '#1890ff' }} />}
        />
        <Button
          type="primary"
          size="small"
          onClick={handleParse}
          loading={loading}
        >
          解析
        </Button>
        <Button
          size="small"
          onClick={() => { setExpanded(false); setParsedAction(null); setInput(''); }}
        >
          <CloseOutlined />
        </Button>
      </Space.Compact>

      {loading && !parsedAction && <Spin size="small" />}

      {parsedAction && (
        <Alert
          type="info"
          showIcon
          icon={<RobotOutlined />}
          message={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>{parsedMessage || parsedAction.description}</span>
              <Space size={4}>
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handleConfirm} loading={loading}>
                  确认创建
                </Button>
                <Button size="small" icon={<CloseOutlined />} onClick={handleCancel}>
                  取消
                </Button>
              </Space>
            </div>
          }
          style={{ padding: '4px 8px' }}
        />
      )}
    </div>
  );
};
