import React, { useState, useEffect, useRef } from 'react';
import { Button, Space, message, Tag, Modal, Table, Divider } from 'antd';
import {
  RobotOutlined, GroupOutlined, ScheduleOutlined,
  UserSwitchOutlined, CheckCircleOutlined, LoadingOutlined,
} from '@ant-design/icons';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { llmApi, batchApi, settingsApi } from '../../lib/api';
import type { Task, Developer, TaskGroup, ScheduleSuggestion, UpdateTaskDto } from '../../lib/types';

type AiOp = 'group' | 'schedule' | 'fill';

interface AiTaskToolbarProps {
  selectedTaskIds: number[];
  allTaskIds: number[];
  tasks: Task[];
  developers: Developer[];
  onRefresh: () => void;
  onHighlight: (ids: number[]) => void;
}

const OP_LABELS: Record<AiOp, { title: string; icon: React.ReactNode }> = {
  group: { title: 'AI 智能分组', icon: <GroupOutlined /> },
  schedule: { title: 'AI 智能排期', icon: <ScheduleOutlined /> },
  fill: { title: 'AI 自动分配', icon: <UserSwitchOutlined /> },
};

export const AiTaskToolbar: React.FC<AiTaskToolbarProps> = ({
  selectedTaskIds, allTaskIds, tasks, developers, onRefresh, onHighlight,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [currentOp, setCurrentOp] = useState<AiOp | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [applying, setApplying] = useState(false);
  const [timingInfo, setTimingInfo] = useState<{
    connectMs?: number; ttftMs?: number; totalMs?: number; model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  }>({});

  // Result states
  const [groupResult, setGroupResult] = useState<TaskGroup[] | null>(null);
  const [scheduleResult, setScheduleResult] = useState<ScheduleSuggestion[] | null>(null);
  const [fillResult, setFillResult] = useState<UpdateTaskDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef('');
  const thinkingRef = useRef('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [thinkingText, setThinkingText] = useState('');

  const targetIds = selectedTaskIds.length > 0 ? selectedTaskIds : allTaskIds;

  // Auto-scroll streaming text
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamText, thinkingText]);

  const taskNameMap = React.useMemo(() => {
    const map: Record<number, string> = {};
    tasks.forEach(t => { map[t.id] = t.name; });
    return map;
  }, [tasks]);

  const devNameMap = React.useMemo(() => {
    const map: Record<number, string> = {};
    developers.forEach(d => { map[d.id] = d.name; });
    return map;
  }, [developers]);

  const resetState = () => {
    setStreamText('');
    setThinkingText('');
    streamRef.current = '';
    thinkingRef.current = '';
    setConnected(false);
    setTimingInfo({});
    setElapsed(0);
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    if (streamThrottleRef.current) {
      clearTimeout(streamThrottleRef.current);
      streamThrottleRef.current = null;
    }
    if (thinkingThrottleRef.current) {
      clearTimeout(thinkingThrottleRef.current);
      thinkingThrottleRef.current = null;
    }
    setGroupResult(null);
    setScheduleResult(null);
    setFillResult(null);
    setError(null);
    setApplying(false);
  };

  const startOp = async (op: AiOp) => {
    if (targetIds.length === 0) { message.warning('没有可操作的任务'); return; }
    resetState();
    setCurrentOp(op);
    setModalOpen(true);
    setStreaming(true);

    // Start elapsed timer
    const startTime = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    // Fetch model name for display
    try {
      const config = await settingsApi.getLlmConfig();
      if (config?.model) {
        setTimingInfo(prev => ({ ...prev, model: config.model }));
      }
    } catch { /* ignore */ }

    let unlisten: UnlistenFn | null = null;
    let unlistenStart: UnlistenFn | null = null;
    let unlistenFirstToken: UnlistenFn | null = null;
    let unlistenDone: UnlistenFn | null = null;
    let unlistenThinking: UnlistenFn | null = null;
    try {
      unlistenStart = await listen<{ connect_ms: number }>('llm-stream-start', (event) => {
        setConnected(true);
        setTimingInfo(prev => ({ ...prev, connectMs: event.payload.connect_ms }));
      });

      unlistenThinking = await listen<string>('llm-stream-thinking', (event) => {
        thinkingRef.current += event.payload;
        if (!thinkingThrottleRef.current) {
          thinkingThrottleRef.current = window.setTimeout(() => {
            setThinkingText(thinkingRef.current);
            thinkingThrottleRef.current = null;
          }, 50);
        }
      });

      unlistenFirstToken = await listen<{ ttft_ms: number; thinking_chars?: number }>('llm-stream-first-token', (event) => {
        setTimingInfo(prev => ({ ...prev, ttftMs: event.payload.ttft_ms }));
      });

      unlistenDone = await listen<{
        total_ms: number;
        content_length: number;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      }>('llm-stream-done', (event) => {
        setTimingInfo(prev => ({
          ...prev,
          totalMs: event.payload.total_ms,
          usage: event.payload.usage ?? undefined,
        }));
      });

      unlisten = await listen<string>('llm-stream-chunk', (event) => {
        streamRef.current += event.payload;
        if (!streamThrottleRef.current) {
          streamThrottleRef.current = window.setTimeout(() => {
            setStreamText(streamRef.current);
            streamThrottleRef.current = null;
          }, 50);
        }
      });

      if (op === 'group') {
        const result = await llmApi.identifySimilarTasks(targetIds);
        setGroupResult(result);
      } else if (op === 'schedule') {
        const result = await llmApi.smartSchedule(targetIds);
        setScheduleResult(result);
      } else {
        const result = await llmApi.autoFillTasks(targetIds);
        setFillResult(result);
      }
    } catch (e: any) {
      setError(String(e));
    } finally {
      setStreaming(false);
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      // Flush remaining throttled content
      if (streamThrottleRef.current) {
        clearTimeout(streamThrottleRef.current);
        streamThrottleRef.current = null;
      }
      if (thinkingThrottleRef.current) {
        clearTimeout(thinkingThrottleRef.current);
        thinkingThrottleRef.current = null;
      }
      setStreamText(streamRef.current);
      setThinkingText(thinkingRef.current);
      if (unlisten) unlisten();
      if (unlistenStart) unlistenStart();
      if (unlistenFirstToken) unlistenFirstToken();
      if (unlistenDone) unlistenDone();
      if (unlistenThinking) unlistenThinking();
    }
  };

  const handleApplySchedule = async () => {
    if (!scheduleResult) return;
    setApplying(true);
    try {
      const updates: UpdateTaskDto[] = scheduleResult.map(s => ({
        id: s.task_id,
        owner_id: s.developer_id,
        planned_start: s.planned_start,
        planned_end: s.planned_end,
      }));
      await batchApi.updateTasks(updates);
      message.success(`已应用 ${updates.length} 条排期建议`);
      onHighlight(updates.map(u => u.id));
      setModalOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(`应用失败: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  const handleApplyFill = async () => {
    if (!fillResult) return;
    setApplying(true);
    try {
      await batchApi.updateTasks(fillResult);
      message.success(`已应用 ${fillResult.length} 条自动分配`);
      onHighlight(fillResult.map(u => u.id));
      setModalOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(`应用失败: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  const handleApplyGroup = async () => {
    if (!groupResult) return;
    setApplying(true);
    try {
      const updates: UpdateTaskDto[] = [];
      groupResult.forEach((g) => {
        if (!g.suggested_external_prefix) return;
        const code = g.suggested_external_prefix;
        g.task_ids.forEach((id, idx) => {
          const existingTask = tasks.find(t => t.id === id);
          const parentNum = existingTask?.parent_number;
          const seq = String(idx + 1).padStart(3, '0');
          updates.push({
            id,
            external_id: parentNum ? `${parentNum}-${code}-${seq}` : `${code}-${seq}`,
            parent_number: parentNum || code,
            parent_name: g.group_name,
          });
        });
      });
      if (updates.length === 0) {
        message.warning('没有可应用的分组编号建议');
        setApplying(false);
        return;
      }
      await batchApi.updateTasks(updates);
      message.success(`已应用 ${updates.length} 条分组编号`);
      onHighlight(updates.map(u => u.id));
      setModalOpen(false);
      onRefresh();
    } catch (e: any) {
      message.error(`应用失败: ${e}`);
    } finally {
      setApplying(false);
    }
  };

  const hasResult = !!groupResult || !!scheduleResult || !!fillResult;
  const opInfo = currentOp ? OP_LABELS[currentOp] : null;

  // Build result table
  const renderResultTable = () => {
    if (error) {
      return <div style={{ color: '#ff4d4f', padding: 12 }}>请求失败: {error}</div>;
    }

    if (groupResult) {
      return (
        <div>
          {groupResult.map((g, i) => (
            <div key={i} style={{
              marginBottom: 10, padding: '10px 14px',
              background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8,
            }}>
              <Space>
                <Tag color="green">{g.group_name}</Tag>
                {g.suggested_external_prefix && <Tag>前缀: {g.suggested_external_prefix}</Tag>}
                <span style={{ fontSize: 12, color: '#999' }}>{g.task_ids.length} 个任务</span>
              </Space>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {g.task_ids.map(id => (
                  <Tag key={id} style={{ marginBottom: 4 }}>{taskNameMap[id] || `#${id}`}</Tag>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (scheduleResult) {
      return (
        <Table
          dataSource={scheduleResult}
          rowKey="task_id"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
          columns={[
            {
              title: '任务', dataIndex: 'task_id', width: 200,
              render: (id: number) => taskNameMap[id] || `#${id}`,
            },
            {
              title: '分配给', dataIndex: 'developer_id', width: 100,
              render: (id: number) => devNameMap[id] || `#${id}`,
            },
            { title: '开始', dataIndex: 'planned_start', width: 110 },
            { title: '结束', dataIndex: 'planned_end', width: 110 },
            { title: '理由', dataIndex: 'reasoning', ellipsis: true },
          ]}
        />
      );
    }

    if (fillResult) {
      return (
        <Table
          dataSource={fillResult}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 300 }}
          columns={[
            {
              title: '任务', dataIndex: 'id', width: 200,
              render: (id: number) => taskNameMap[id] || `#${id}`,
            },
            {
              title: '分配给', dataIndex: 'owner_id', width: 100,
              render: (id: number) => devNameMap[id] || `#${id}`,
            },
            { title: '开始', dataIndex: 'planned_start', width: 110 },
            { title: '结束', dataIndex: 'planned_end', width: 110 },
          ]}
        />
      );
    }
    return null;
  };

  // Modal footer
  const renderFooter = () => {
    if (streaming) return null;
    const buttons: React.ReactNode[] = [
      <Button key="close" onClick={() => setModalOpen(false)}>关闭</Button>,
    ];
    if (groupResult) {
      const hasPrefix = groupResult.some(g => g.suggested_external_prefix);
      if (hasPrefix) {
        buttons.push(
          <Button key="apply" type="primary" icon={<CheckCircleOutlined />}
            onClick={handleApplyGroup} loading={applying}>
            应用分组编号
          </Button>
        );
      }
    }
    if (scheduleResult) {
      buttons.push(
        <Button key="apply" type="primary" icon={<CheckCircleOutlined />}
          onClick={handleApplySchedule} loading={applying}>
          一键应用全部排期
        </Button>
      );
    }
    if (fillResult) {
      buttons.push(
        <Button key="apply" type="primary" icon={<CheckCircleOutlined />}
          onClick={handleApplyFill} loading={applying}>
          一键应用全部分配
        </Button>
      );
    }
    return buttons;
  };

  return (
    <>
      <Space wrap>
        <Tag icon={<RobotOutlined />} color="blue">AI 助手</Tag>
        <Button size="small" icon={<GroupOutlined />} onClick={() => startOp('group')} disabled={streaming}>
          智能分组
        </Button>
        <Button size="small" icon={<ScheduleOutlined />} onClick={() => startOp('schedule')} disabled={streaming}>
          智能排期
        </Button>
        <Button size="small" icon={<UserSwitchOutlined />} onClick={() => startOp('fill')} disabled={streaming}>
          自动分配
        </Button>
        <span style={{ color: '#999', fontSize: 12 }}>
          {selectedTaskIds.length > 0
            ? `已选 ${selectedTaskIds.length} 项`
            : `当前列表 ${allTaskIds.length} 项`}
        </span>
      </Space>

      <Modal
        title={
          <Space>
            {opInfo?.icon}
            <span>{opInfo?.title}</span>
            {streaming && <Tag color="processing" icon={<LoadingOutlined />}>分析中</Tag>}
            {hasResult && !streaming && (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                完成{timingInfo.ttftMs != null && ` (首字 ${(timingInfo.ttftMs / 1000).toFixed(1)}s)`}
              </Tag>
            )}
          </Space>
        }
        open={modalOpen}
        onCancel={() => { if (!streaming) setModalOpen(false); }}
        footer={renderFooter()}
        width={800}
        maskClosable={false}
        styles={{ body: { padding: '12px 20px', maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {/* Thinking content (shown during model reasoning phase) */}
        {thinkingText && (
          <div ref={!streamText ? scrollRef : undefined} style={{
            background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8,
            padding: '10px 14px', maxHeight: streamText ? 150 : 300, overflowY: 'auto',
            marginBottom: 10, fontSize: 12, lineHeight: 1.6, color: '#8c6900',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11 }}>
              💭 模型思考过程 {streaming && <span className="streaming-cursor" style={{ color: '#d48806' }}>▊</span>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{thinkingText}</div>
          </div>
        )}

        {/* Streaming AI analysis text — hide when structured result is ready */}
        {streamText && (streaming || !hasResult) && (
          <div ref={scrollRef} style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 16px',
            maxHeight: 400, overflowY: 'auto',
            fontSize: 13, lineHeight: 1.7,
          }}>
            <div className="chat-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamText}</ReactMarkdown>
              {streaming && <span className="streaming-cursor">▊</span>}
            </div>
          </div>
        )}

        {/* Empty streaming state — no thinking, no content yet */}
        {streaming && !streamText && !thinkingText && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            <LoadingOutlined style={{ fontSize: 24, marginBottom: 12, display: 'block' }} />
            {connected
              ? <>
                  AI 正在思考中... <span style={{ fontFamily: 'monospace' }}>{elapsed}s</span>
                  <div style={{ fontSize: 11, marginTop: 6 }}>
                    {timingInfo.model && <span>模型: {timingInfo.model} | </span>}
                    网络连接 {((timingInfo.connectMs ?? 0) / 1000).toFixed(1)}s，等待模型输出首字
                  </div>
                </>
              : <>正在连接 AI 服务... <span style={{ fontFamily: 'monospace' }}>{elapsed}s</span></>}
          </div>
        )}

        {/* Structured results */}
        {hasResult && (
          <>
            <Divider style={{ margin: '8px 0' }}>分析结果</Divider>
            {renderResultTable()}
          </>
        )}

        {/* Error */}
        {error && !streaming && (
          <div style={{ color: '#ff4d4f', padding: 12, background: '#fff2f0', borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* Token & timing log */}
        {!streaming && (timingInfo.totalMs != null || timingInfo.usage) && (
          <div style={{
            marginTop: 12, padding: '8px 12px', background: '#fafafa',
            borderRadius: 6, fontSize: 12, color: '#888', fontFamily: 'monospace',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#666' }}>请求日志</div>
            {timingInfo.model && <div>模型: {timingInfo.model}</div>}
            {timingInfo.connectMs != null && <div>网络连接: {(timingInfo.connectMs / 1000).toFixed(2)}s</div>}
            {timingInfo.ttftMs != null && <div>首字延迟 (TTFT): {(timingInfo.ttftMs / 1000).toFixed(2)}s{thinkingText ? ` (含深度思考 ${thinkingText.length} 字)` : ''}</div>}
            {timingInfo.totalMs != null && <div>总耗时: {(timingInfo.totalMs / 1000).toFixed(2)}s</div>}
            {timingInfo.usage && (
              <div style={{ marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4 }}>
                Prompt: {timingInfo.usage.prompt_tokens.toLocaleString()} |
                Completion: {timingInfo.usage.completion_tokens.toLocaleString()} |
                Total: {timingInfo.usage.total_tokens.toLocaleString()}
                {thinkingText && <span style={{ color: '#d48806' }}> | 思考约 {Math.round(timingInfo.usage.completion_tokens * 0.8)} tokens</span>}
              </div>
            )}
            {!timingInfo.usage && timingInfo.totalMs != null && (
              <div style={{ marginTop: 4, color: '#bbb' }}>
                Token 统计: 当前 API 未返回 usage 数据
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
