import type { ChatMessage, ChatRole, ChatStreamEvent, Conversation, ToolCallRecord } from '../types/chat';
import type { CitationSource } from '../components/MarkdownContent';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  let id = localStorage.getItem('tj_chat_session_id');
  if (!id) {
    id = `tj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem('tj_chat_session_id', id);
  }
  return id;
}

const getHeaders = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  'x-session-id': getOrCreateSessionId(),
  ...extra,
});

export interface StreamChatOptions {
  conversationId?: string | null;
  message?: string;
  regenerateMessageId?: string | null;
  toolsEnabled?: boolean;
  modes?: import('../types/chat').ChatModes;
  language?: 'ru' | 'tg';
  signal?: AbortSignal;
  onEvent: (event: ChatStreamEvent | { type: 'conversation_created'; conversation: Conversation }) => void;
}

export const chatService = {
  getSessionId: getOrCreateSessionId,

  async getConversations(query = '', offset = 0, limit = 50): Promise<Conversation[]> {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      ...(query ? { query } : {}),
    });
    const res = await fetch(`/api/chat/conversations?${params.toString()}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось загрузить историю диалогов.');
    const data = await res.json();
    return data.conversations || [];
  },

  async createConversation(title = 'Новый разговор', pinned = false, metadata = {}): Promise<Conversation> {
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title, pinned, metadata }),
    });
    if (!res.ok) throw new Error('Не удалось создать диалог.');
    const data = await res.json();
    return data.conversation;
  },

  async getConversationDetails(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Диалог не найден.');
    return await res.json();
  },

  async updateConversation(id: string, patch: Partial<Conversation>): Promise<Conversation> {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Не удалось обновить диалог.');
    const data = await res.json();
    return data.conversation;
  },

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось удалить диалог.');
    return true;
  },

  async getMessages(conversationId: string, offset = 0, limit = 100): Promise<ChatMessage[]> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось загрузить сообщения.');
    const data = await res.json();
    return data.messages || [];
  },

  async addMessage(
    conversationId: string,
    role: ChatRole,
    content: string,
    sources: CitationSource[] = [],
    toolCalls: ToolCallRecord[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<ChatMessage> {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ role, content, sources, tool_calls: toolCalls, metadata }),
    });
    if (!res.ok) throw new Error('Не удалось сохранить сообщение.');
    const data = await res.json();
    return data.message;
  },

  async deleteMessage(id: string, conversationId: string): Promise<boolean> {
    const res = await fetch(`/api/chat/messages/${encodeURIComponent(id)}?conversationId=${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Не удалось удалить сообщение.');
    return true;
  },

  async updateMessage(id: string, conversationId: string, patch: Partial<ChatMessage>): Promise<ChatMessage> {
    const res = await fetch(`/api/chat/messages/${encodeURIComponent(id)}?conversationId=${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Не удалось обновить сообщение.');
    const data = await res.json();
    return data.message;
  },

  /**
   * Unified AI interaction recording:
   * When user triggers Location Summary, Research, or Explainer elsewhere in the app,
   * this logs the conversation & messages to Supabase / store so the user can continue in AI Chat!
   */
  async recordExternalAiInteraction({
    title,
    userPrompt,
    assistantContent,
    sources = [],
    metadata = {},
  }: {
    title: string;
    userPrompt: string;
    assistantContent: string;
    sources?: CitationSource[];
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    try {
      const conv = await this.createConversation(title, false, metadata);
      await this.addMessage(conv.id, 'user', userPrompt);
      await this.addMessage(conv.id, 'assistant', assistantContent, sources, [], metadata);
      return conv.id;
    } catch (err) {
      console.warn('Failed to record external AI interaction in chat history:', err);
      return '';
    }
  },

  async streamChat({
    conversationId,
    message,
    regenerateMessageId,
    toolsEnabled = true,
    modes,
    language,
    signal,
    onEvent,
  }: StreamChatOptions): Promise<void> {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        conversationId,
        message,
        regenerateMessageId,
        toolsEnabled,
        modes,
        language,
      }),
      signal,
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errData?.error || `Ошибка сервера: HTTP ${res.status}`);
    }

    if (!res.body) {
      throw new Error('Браузер не получил поток данных.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as ChatStreamEvent | { type: 'conversation_created'; conversation: Conversation };
          onEvent(event);
        } catch {
          // ignore malformed line
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as ChatStreamEvent;
        onEvent(event);
      } catch {}
    }
  },
};
