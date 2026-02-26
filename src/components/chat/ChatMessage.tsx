import React, { useState } from 'react';
import { Avatar, message } from 'antd';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ActionCard } from './ActionCard';
import { useChatStore } from '../../stores/chatStore';
import type { ChatMessageItem } from '../../stores/chatStore';
import type { ChatAction } from '../../lib/types';

interface ChatMessageProps {
  item: ChatMessageItem;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ item }) => {
  const executeAction = useChatStore((s) => s.executeAction);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  const [showThinking, setShowThinking] = useState(false);

  const isUser = item.role === 'user';

  const handleApply = async (action: ChatAction, index: number) => {
    setApplyingIndex(index);
    try {
      const result = await executeAction(action);
      message.success(result || '操作已执行');
    } catch (e) {
      message.error(String(e));
    } finally {
      setApplyingIndex(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        flexDirection: isUser ? 'row-reverse' : 'row',
        marginBottom: 20,
        padding: '0 12px',
        alignItems: 'flex-start',
      }}
    >
      <Avatar
        size={32}
        style={{
          backgroundColor: isUser ? '#1677ff' : '#52c41a',
          flexShrink: 0,
        }}
        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
      />

      <div style={{ maxWidth: '75%', minWidth: 60 }}>
        {/* Thinking content (collapsible) */}
        {!isUser && item.thinking && (
          <div style={{ marginBottom: 6 }}>
            <div
              onClick={() => setShowThinking(!showThinking)}
              style={{
                fontSize: 11, color: '#d48806', cursor: 'pointer',
                userSelect: 'none', padding: '2px 0',
              }}
            >
              {item.streaming && !item.content ? '💭 思考中...' : `💭 思考过程 (${item.thinking.length} 字)`}
              {!item.streaming && <span style={{ marginLeft: 4 }}>{showThinking ? '▼' : '▶'}</span>}
            </div>
            {(showThinking || (item.streaming && !item.content)) && (
              <div style={{
                background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8,
                padding: '8px 12px', maxHeight: 200, overflowY: 'auto',
                fontSize: 12, lineHeight: 1.5, color: '#8c6900',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {item.thinking}
                {item.streaming && !item.content && <span className="streaming-cursor" style={{ color: '#d48806' }}>▊</span>}
              </div>
            )}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={isUser ? 'chat-bubble-user' : 'chat-bubble-ai'}
          style={{
            padding: '10px 14px',
            borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            backgroundColor: isUser ? '#1677ff' : '#f6f6f6',
            color: isUser ? '#fff' : 'rgba(0, 0, 0, 0.88)',
            fontSize: 14,
            lineHeight: 1.7,
            wordBreak: 'break-word',
          }}
        >
          {isUser ? (
            <span style={{ whiteSpace: 'pre-wrap' }}>{item.content}</span>
          ) : (
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {item.content || ''}
              </ReactMarkdown>
              {item.streaming && (
                <span className="streaming-cursor">▊</span>
              )}
            </div>
          )}
        </div>

        {/* Action cards */}
        {item.actions && item.actions.length > 0 && !item.streaming && (
          <div style={{ marginTop: 6 }}>
            {item.actions.map((action, index) => (
              <ActionCard
                key={`${item.id}_action_${index}`}
                action={action}
                onApply={() => handleApply(action, index)}
                applying={applyingIndex === index}
              />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          style={{
            fontSize: 11,
            color: 'rgba(0, 0, 0, 0.3)',
            marginTop: 4,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {new Date(item.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
