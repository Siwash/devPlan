import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { llmApi } from '../lib/api';
import type { ChatAction, ChatMessage, LlmChatResponse } from '../lib/types';

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  actions?: ChatAction[];
  timestamp: number;
  streaming?: boolean;
}

interface ChatState {
  messages: ChatMessageItem[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  executeAction: (action: ChatAction) => Promise<string>;
  clearHistory: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  loading: false,

  sendMessage: async (content: string) => {
    const userMessage: ChatMessageItem = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Create placeholder for streaming response
    const assistantMsgId = `msg_${Date.now()}_assistant`;
    const assistantPlaceholder: ChatMessageItem = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    set((state) => ({
      messages: [...state.messages, userMessage, assistantPlaceholder],
      loading: true,
    }));

    // Listen for stream chunks with throttling
    let unlisten: UnlistenFn | null = null;
    let unlistenThinking: UnlistenFn | null = null;
    let pendingContent = '';
    let pendingThinking = '';
    let contentTimer: number | null = null;
    let thinkingTimer: number | null = null;

    const flushContent = () => {
      if (pendingContent) {
        const chunk = pendingContent;
        pendingContent = '';
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: m.content + chunk }
              : m
          ),
        }));
      }
      contentTimer = null;
    };

    const flushThinking = () => {
      if (pendingThinking) {
        const chunk = pendingThinking;
        pendingThinking = '';
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === assistantMsgId
              ? { ...m, thinking: (m.thinking || '') + chunk }
              : m
          ),
        }));
      }
      thinkingTimer = null;
    };

    try {
      unlistenThinking = await listen<string>('llm-stream-thinking', (event) => {
        pendingThinking += event.payload;
        if (!thinkingTimer) {
          thinkingTimer = window.setTimeout(flushThinking, 50);
        }
      });

      unlisten = await listen<string>('llm-stream-chunk', (event) => {
        pendingContent += event.payload;
        if (!contentTimer) {
          contentTimer = window.setTimeout(flushContent, 50);
        }
      });

      // Build history (exclude the placeholder)
      const history: ChatMessage[] = get()
        .messages.filter((msg) => msg.id !== assistantMsgId && msg.role !== undefined)
        .slice(0, -1) // exclude the user message we just added (it goes via param)
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response: LlmChatResponse = await llmApi.chat(content, history);

      // Finalize message with parsed actions
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: response.message,
                actions: response.actions.length > 0 ? response.actions : undefined,
                streaming: false,
              }
            : m
        ),
        loading: false,
      }));
    } catch (e) {
      // If streaming started, update the placeholder; otherwise create error message
      set((state) => {
        const existing = state.messages.find((m) => m.id === assistantMsgId);
        if (existing && existing.content) {
          // Had partial content, just mark as done
          return {
            messages: state.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, streaming: false } : m
            ),
            loading: false,
          };
        }
        // No content yet, replace placeholder with error
        return {
          messages: state.messages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `请求失败: ${String(e)}`,
                  streaming: false,
                }
              : m
          ),
          loading: false,
        };
      });
    } finally {
      // Flush any remaining content
      if (contentTimer) { clearTimeout(contentTimer); contentTimer = null; }
      if (thinkingTimer) { clearTimeout(thinkingTimer); thinkingTimer = null; }
      flushContent();
      flushThinking();
      if (unlisten) unlisten();
      if (unlistenThinking) unlistenThinking();
    }
  },

  executeAction: async (action: ChatAction) => {
    try {
      const result = await llmApi.executeAction(action);
      return result;
    } catch (e) {
      throw new Error(`执行操作失败: ${String(e)}`);
    }
  },

  clearHistory: () => {
    set({ messages: [], loading: false });
  },
}));
