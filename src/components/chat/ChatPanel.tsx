import React, { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Input, Space, Tooltip } from 'antd';
import {
  SendOutlined,
  DeleteOutlined,
  RobotOutlined,
  BulbOutlined,
  CalendarOutlined,
  TeamOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useChatStore } from '../../stores/chatStore';
import { ChatMessage } from './ChatMessage';

const { TextArea } = Input;

const QUICK_PROMPTS = [
  { icon: <FileTextOutlined />, text: '列出所有待开始的任务' },
  { icon: <CalendarOutlined />, text: '帮我安排本周的任务' },
  { icon: <TeamOutlined />, text: '查看每个人的工作量' },
  { icon: <BulbOutlined />, text: '创建一个新的代码开发任务' },
];

interface ChatPanelProps {
  mode: 'drawer' | 'page';
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ mode }) => {
  const { messages, loading, sendMessage, clearHistory } = useChatStore();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = inputValue.trim();
    if (!content || loading) return;
    setInputValue('');
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = async (text: string) => {
    if (loading) return;
    await sendMessage(text);
  };

  const isPage = mode === 'page';
  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isPage ? 'calc(100vh - 180px)' : '100%',
        maxWidth: isPage ? 900 : undefined,
        margin: isPage ? '0 auto' : undefined,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <Space>
          <RobotOutlined style={{ fontSize: 20, color: '#52c41a' }} />
          <span style={{ fontWeight: 600, fontSize: 16 }}>AI 助手</span>
          <span style={{ fontSize: 12, color: '#999' }}>
            基于大模型的智能项目管理助手
          </span>
        </Space>
        <Tooltip title="清空对话记录">
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={clearHistory}
            disabled={messages.length === 0}
          >
            清空
          </Button>
        </Tooltip>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 0',
          minHeight: 0,
        }}
      >
        {/* Welcome screen */}
        {isEmpty && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '0 24px',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #52c41a 0%, #1677ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <RobotOutlined style={{ fontSize: 32, color: '#fff' }} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
              DevPlan AI 助手
            </div>
            <div style={{ color: '#999', marginBottom: 24, textAlign: 'center' }}>
              我可以帮你管理任务、智能排期、分析工作量，也支持直接创建和修改任务
            </div>

            {/* Quick prompts */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                maxWidth: 460,
                width: '100%',
              }}
            >
              {QUICK_PROMPTS.map((prompt) => (
                <div
                  key={prompt.text}
                  onClick={() => handleQuickPrompt(prompt.text)}
                  style={{
                    padding: '12px 14px',
                    border: '1px solid #e8e8e8',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    color: '#555',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1677ff';
                    e.currentTarget.style.color = '#1677ff';
                    e.currentTarget.style.background = '#f0f5ff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e8e8e8';
                    e.currentTarget.style.color = '#555';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {prompt.icon}
                  {prompt.text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} item={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          flexShrink: 0,
          background: '#fafafa',
          borderRadius: '0 0 8px 8px',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
            style={{
              resize: 'none',
              borderRadius: 10,
              flex: 1,
              fontSize: 14,
            }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSend}
            disabled={!inputValue.trim() || loading}
            loading={loading}
            style={{
              height: 38,
              borderRadius: 10,
              paddingInline: 16,
            }}
          >
            发送
          </Button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#bbb',
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          AI 回复基于大语言模型生成，可能存在错误，请注意核实
        </div>
      </div>
    </div>
  );
};

/* ---- ChatDrawer: wraps ChatPanel inside an Ant Design Drawer ---- */

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ open, onClose }) => {
  return (
    <Drawer
      title={null}
      placement="right"
      width={480}
      open={open}
      onClose={onClose}
      closable
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
      }}
    >
      <ChatPanel mode="drawer" />
    </Drawer>
  );
};
