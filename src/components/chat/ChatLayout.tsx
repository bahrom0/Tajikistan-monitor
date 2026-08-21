import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatMessage, CitationSource, Conversation, ToolCallRecord, ChatModes, AgentStep, ChatTimelineItem } from '../../types/chat';
import { chatService } from '../../lib/chat-service';
import { ChatSidebar } from './ChatSidebar';
import { ChatMessageList } from './ChatMessageList';
import { ChatComposer } from './ChatComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { SidebarIcon, PlusIcon, TrashIcon } from '../icons';

interface ChatLayoutProps {
  language: 'ru' | 'tg';
  theme: 'dark' | 'light';
  initialConversationId?: string | null;
  onNavigateMap?: () => void;
}

function getInitialChatModes(): ChatModes {
  const defaultModes: ChatModes = {
    webSearch: true,
    dbSearch: true,
    officialStrict: false,
  };
  if (typeof window === 'undefined') return defaultModes;
  try {
    const stored = localStorage.getItem('tj_chat_modes');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ChatModes>;
      return {
        webSearch: typeof parsed.webSearch === 'boolean' ? parsed.webSearch : true,
        dbSearch: typeof parsed.dbSearch === 'boolean' ? parsed.dbSearch : true,
        officialStrict: typeof parsed.officialStrict === 'boolean' ? parsed.officialStrict : false,
      };
    }
  } catch {}
  return defaultModes;
}

export function ChatLayout({ language, initialConversationId }: ChatLayoutProps) {
  const isTg = language === 'tg';

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Messages State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Modes State (webSearch is enabled by default)
  const [modes, setModes] = useState<ChatModes>(getInitialChatModes);

  const handleToggleMode = (modeKey: keyof ChatModes) => {
    setModes((prev) => {
      const next = { ...prev, [modeKey]: !prev[modeKey] };
      if (modeKey === 'officialStrict' && next.officialStrict) {
        next.dbSearch = true;
      }
      try {
        localStorage.setItem('tj_chat_modes', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Streaming State
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [isThinkingActive, setIsThinkingActive] = useState(false);
  const [streamingSources, setStreamingSources] = useState<CitationSource[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallRecord[]>([]);
  const [streamingAgentSteps, setStreamingAgentSteps] = useState<AgentStep[]>([]);
  const [streamingTimeline, setStreamingTimeline] = useState<ChatTimelineItem[]>([]);

  // Refs for race-condition prevention
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipFetchForConvIdRef = useRef<string | null>(null);
  const isStreamingRef = useRef(false);

  // Controls & Responsive
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Load conversations list
  const loadConversations = async (query = '') => {
    try {
      setLoadingConversations(true);
      const list = await chatService.getConversations(query);
      setConversations(list);
    } catch (err) {
      console.warn('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  };

  // Initial load
  useEffect(() => {
    void loadConversations();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadConversations(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load messages when activeConvId changes
  useEffect(() => {
    if (!activeConvId) {
      if (!isStreamingRef.current) {
        setMessages([]);
      }
      return;
    }

    // Skip refetching if this conversation was just created by the current streaming session
    if (skipFetchForConvIdRef.current === activeConvId) {
      skipFetchForConvIdRef.current = null;
      return;
    }

    let isMounted = true;
    const fetchMsgs = async () => {
      setLoadingMessages(true);
      try {
        const data = await chatService.getMessages(activeConvId);
        if (isMounted) {
          setMessages(data);
        }
      } catch (err) {
        console.warn('Failed to load messages for conversation:', err);
      } finally {
        if (isMounted) setLoadingMessages(false);
      }
    };

    void fetchMsgs();
    return () => {
      isMounted = false;
    };
  }, [activeConvId]);

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === activeConvId);

  // Start new chat
  const handleNewChat = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setEditingMessageId(null);
    setStreamingContent('');
    setStreamingThinking('');
    setIsThinkingActive(false);
    setStreamingSources([]);
    setStreamingToolCalls([]);
    setStreamingAgentSteps([]);
    setStreamingTimeline([]);
  };

  // Select conversation
  const handleSelectConversation = (id: string) => {
    if (id === activeConvId) return;
    if (isStreaming) {
      abortControllerRef.current?.abort();
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
    setActiveConvId(id);
    setInput('');
    setEditingMessageId(null);
    setStreamingContent('');
    setStreamingThinking('');
    setIsThinkingActive(false);
    setStreamingSources([]);
    setStreamingToolCalls([]);
    setStreamingAgentSteps([]);
    setStreamingTimeline([]);
  };

  // Rename conversation
  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updated = await chatService.updateConversation(id, { title: newTitle });
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      console.warn('Failed to rename conversation:', err);
    }
  };

  // Delete conversation
  const handleDelete = async (id: string) => {
    try {
      await chatService.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        handleNewChat();
      }
    } catch (err) {
      console.warn('Failed to delete conversation:', err);
    }
  };

  // Toggle Pin
  const handleTogglePin = async (id: string, currentPin: boolean) => {
    try {
      const updated = await chatService.updateConversation(id, { pinned: !currentPin });
      setConversations((prev) => {
        const list = prev.map((c) => (c.id === id ? updated : c));
        list.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at);
        });
        return list;
      });
    } catch (err) {
      console.warn('Failed to toggle pin:', err);
    }
  };

  // Stop Generation
  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
    isStreamingRef.current = false;
    setIsStreaming(false);
  };

  // Send or Regenerate message
  const handleSendMessage = async (customPrompt?: string) => {
    const text = (customPrompt || input).trim();
    if (!text && !editingMessageId) return;

    // Abort any ongoing stream
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    isStreamingRef.current = true;
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingThinking('');
    setIsThinkingActive(false);
    setStreamingSources([]);
    setStreamingToolCalls([]);
    setStreamingAgentSteps([]);
    setStreamingTimeline([]);

    let accumulatedContent = '';
    let accumulatedThinking = '';
    let accumulatedSources: CitationSource[] = [];
    let accumulatedToolCalls: ToolCallRecord[] = [];
    let accumulatedAgentSteps: AgentStep[] = [];
    let accumulatedTimeline: ChatTimelineItem[] = [];
    let currentConvId = activeConvId;
    let savedAssistantMsgId: string | null = null;

    const tempUserMsgId = `temp_${Date.now()}`;
    if (!editingMessageId) {
      // Optimistically add user message
      setMessages((prev) => [
        ...prev,
        {
          id: tempUserMsgId,
          conversation_id: activeConvId || '',
          role: 'user',
          content: text,
          sources: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setInput('');
    }

    try {
      await chatService.streamChat({
        conversationId: activeConvId,
        message: text,
        regenerateMessageId: editingMessageId,
        modes,
        language,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'conversation_created') {
            currentConvId = event.conversation.id;
            skipFetchForConvIdRef.current = event.conversation.id;
            setActiveConvId(event.conversation.id);
            setConversations((prev) => [
              event.conversation,
              ...prev.filter((c) => c.id !== event.conversation.id),
            ]);
          } else if (event.type === 'token') {
            setIsThinkingActive(false);
            accumulatedContent += event.value;
            setStreamingContent((curr) => curr + event.value);
            const last = accumulatedTimeline[accumulatedTimeline.length - 1];
            accumulatedTimeline = last?.type === 'assistant'
              ? [...accumulatedTimeline.slice(0, -1), { ...last, content: last.content + event.value }]
              : [...accumulatedTimeline, { type: 'assistant', id: `text_${accumulatedTimeline.length}`, content: event.value }];
            setStreamingTimeline(accumulatedTimeline);
          } else if (event.type === 'think_token') {
            setIsThinkingActive(true);
            accumulatedThinking += event.value;
            setStreamingThinking((curr) => curr + event.value);
          } else if (event.type === 'agent_step') {
            const step = event.step;
            accumulatedAgentSteps = [...accumulatedAgentSteps.filter((s) => s.id !== step.id), step];
            setStreamingAgentSteps((curr) => [...curr.filter((s) => s.id !== step.id), step]);
          } else if (event.type === 'activity') {
            const step = event.step;
            accumulatedAgentSteps = [...accumulatedAgentSteps.filter((s) => s.id !== step.id), step];
            accumulatedTimeline = accumulatedTimeline.some((item) => item.type === 'activity' && item.id === step.id)
              ? accumulatedTimeline.map((item) =>
                  item.type === 'activity' && item.id === step.id ? { ...item, step } : item
                )
              : [...accumulatedTimeline, { type: 'activity', id: step.id, step }];
            setStreamingAgentSteps(accumulatedAgentSteps);
            setStreamingTimeline(accumulatedTimeline);
          } else if (event.type === 'sources') {
            const existingIds = new Set(accumulatedSources.map((s) => s.id));
            const fresh = event.items.filter((s) => !existingIds.has(s.id));
            accumulatedSources = [...accumulatedSources, ...fresh];
            setStreamingSources((curr) => {
              const ids = new Set(curr.map((s) => s.id));
              const f = event.items.filter((s) => !ids.has(s.id));
              return [...curr, ...f];
            });
          } else if (event.type === 'tool_start') {
            const rec: ToolCallRecord = {
              id: event.id,
              name: event.name,
              label: event.label,
              state: 'running',
              args: event.args || {},
            };
            accumulatedToolCalls = [...accumulatedToolCalls.filter((t) => t.id !== event.id), rec];
            accumulatedTimeline = [
              ...accumulatedTimeline.filter((item) => !(item.type === 'tool' && item.id === event.id)),
              { type: 'tool', id: event.id, toolCall: rec },
            ];
            setStreamingTimeline(accumulatedTimeline);
            setStreamingToolCalls((curr) => [
              ...curr.filter((t) => t.id !== event.id),
              rec,
            ]);
          } else if (event.type === 'tool_done') {
            accumulatedToolCalls = accumulatedToolCalls.map((t) =>
              t.id === event.id
                ? { ...t, state: event.state || 'done', resultSummary: event.resultSummary }
                : t
            );
            accumulatedTimeline = accumulatedTimeline.map((item) =>
              item.type === 'tool' && item.id === event.id
                ? {
                    ...item,
                    toolCall: {
                      ...item.toolCall,
                      state: event.state || 'done',
                      resultSummary: event.resultSummary,
                    },
                  }
                : item
            );
            setStreamingTimeline(accumulatedTimeline);
            setStreamingToolCalls((curr) =>
              curr.map((t) =>
                t.id === event.id
                  ? { ...t, state: event.state || 'done', resultSummary: event.resultSummary }
                  : t
              )
            );
          } else if (event.type === 'title_generated') {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === event.conversationId
                  ? {
                      ...c,
                      title: event.title,
                      metadata: {
                        ...(c.metadata || {}),
                        icon: event.icon || (c.metadata as Record<string, unknown> | undefined)?.icon,
                      },
                    }
                  : c
              )
            );
          } else if (event.type === 'message_saved') {
            savedAssistantMsgId = event.messageId;
          } else if (event.type === 'error') {
            console.error('Chat stream error:', event.message);
            if (!accumulatedContent) {
              const safeError = isTg
                ? '⚠️ Ҷавоби ИИ гирифта нашуд. Лутфан дубора кӯшиш кунед.'
                : '⚠️ Не удалось получить корректный ответ ИИ. Попробуйте ещё раз.';
              accumulatedContent = safeError;
              accumulatedTimeline = [{ type: 'assistant', id: 'stream_error', content: safeError }];
              setStreamingContent(safeError);
              setStreamingTimeline(accumulatedTimeline);
            }
          }
        },
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('Chat error:', err);
        if (!accumulatedContent) {
          accumulatedContent = `⚠️ ${err instanceof Error ? err.message : 'Произошла ошибка при получении ответа.'}`;
        }
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        isStreamingRef.current = false;
        setIsThinkingActive(false);

        // Commit final assistant message to local messages state
        if (accumulatedContent || accumulatedThinking) {
          const finalConvId = currentConvId || activeConvId || '';
          const finalAssistantMsg: ChatMessage = {
            id: savedAssistantMsgId || `asst_${Date.now()}`,
            conversation_id: finalConvId,
            role: 'assistant',
            content: accumulatedContent,
            thinking_content: accumulatedThinking || undefined,
            sources: accumulatedSources,
            tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
            agent_steps: accumulatedAgentSteps.length > 0 ? accumulatedAgentSteps : undefined,
            metadata: { timeline: accumulatedTimeline },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === tempUserMsgId ? { ...m, conversation_id: finalConvId } : m
            );
            if (updated.some((m) => m.id === finalAssistantMsg.id)) {
              return updated;
            }
            return [...updated, finalAssistantMsg];
          });
        }

        setIsStreaming(false);
        setStreamingContent('');
        setStreamingThinking('');
        setStreamingSources([]);
        setStreamingToolCalls([]);
        setStreamingAgentSteps([]);
        setStreamingTimeline([]);
        setEditingMessageId(null);

        // Background sync to ensure true IDs and timestamps match server
        if (currentConvId) {
          const syncId = currentConvId;
          void chatService.getMessages(syncId).then((fresh) => {
            if (fresh && fresh.length > 0) {
              setMessages(fresh);
            }
          });
        }
      }
    }
  };

  // Retry / Regenerate assistant message
  const handleRetry = async (messageId: string) => {
    if (isStreaming) return;
    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx < 0) return;

    // Find the preceding user message
    const precedingUserMsg = [...messages.slice(0, msgIdx)].reverse().find((m) => m.role === 'user');
    if (!precedingUserMsg) return;

    // Truncate messages in UI
    setMessages((prev) => prev.slice(0, msgIdx));
    setEditingMessageId(precedingUserMsg.id);
    await handleSendMessage(precedingUserMsg.content);
  };

  // Edit user message
  const handleEdit = (messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setInput(currentContent);
  };

  // Delete message
  const handleDeleteMessage = async (messageId: string) => {
    if (!activeConvId) return;
    try {
      await chatService.deleteMessage(messageId, activeConvId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.warn('Failed to delete message:', err);
    }
  };

  return (
    <div class="chat-workspace-shell">
      {/* 2nd Column: Chat History Sidebar */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        onRename={handleRename}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={loadingConversations}
        language={language}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Mobile Sidebar Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div class="chat-sidebar-backdrop" onClick={() => setIsMobileSidebarOpen(false)} />
      )}

      {/* 3rd Column: Main Conversation Area */}
      <main class="chat-main-column">
        {/* Chat Top Header */}
        <header class="chat-top-header">
          <div class="chat-top-header-left">
            <button
              type="button"
              class="chat-mobile-sidebar-toggle"
              onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
              aria-label={isTg ? 'Кушодани таърих' : 'Открыть историю'}
            >
              <SidebarIcon size={18} />
            </button>

            <div class="chat-header-title-box">
              <h2 class="chat-header-title">
                {activeConversation
                  ? activeConversation.title
                  : isTg
                    ? 'Ёрдамчии ҳушманд'
                    : 'Интеллектуальный ассистент'}
              </h2>
            </div>
          </div>

          <div class="chat-top-header-right">
            {activeConvId && (
              <button
                type="button"
                class="chat-header-action-btn danger"
                onClick={() => handleDelete(activeConvId)}
                title={isTg ? 'Нест кардани ин гуфтугӯ' : 'Удалить этот диалог'}
              >
                <TrashIcon size={15} />
              </button>
            )}

            <button
              type="button"
              class="chat-header-action-btn"
              onClick={handleNewChat}
              title={isTg ? 'Гуфтугӯи нав' : 'Новый диалог'}
            >
              <PlusIcon size={15} />
              <span>{isTg ? 'Нав' : 'Новый'}</span>
            </button>
          </div>
        </header>

        {/* Chat Conversation Content */}
        <section class="chat-stage-content">
          {!activeConvId && messages.length === 0 && !isStreaming ? (
            <ChatEmptyState
              onSelectSuggestion={(prompt) => void handleSendMessage(prompt)}
              language={language}
            />
          ) : (
            <ChatMessageList
              messages={messages}
              streamingContent={streamingContent}
              streamingThinking={streamingThinking}
              streamingSources={streamingSources}
              streamingToolCalls={streamingToolCalls}
              streamingAgentSteps={streamingAgentSteps}
              streamingTimeline={streamingTimeline}
              isStreaming={isStreaming}
              isThinkingActive={isThinkingActive}
              onRetry={handleRetry}
              onEdit={handleEdit}
              onDelete={handleDeleteMessage}
              language={language}
              loadingMessages={loadingMessages}
            />
          )}
        </section>

        {/* Chat Bottom Composer */}
        <footer class="chat-footer-composer-area">
          <ChatComposer
            input={input}
            onInputChange={setInput}
            onSend={() => void handleSendMessage()}
            onStop={handleStopGeneration}
            isStreaming={isStreaming}
            disabled={loadingMessages}
            modes={modes}
            onToggleMode={handleToggleMode}
            language={language}
            editingMessageId={editingMessageId}
            onCancelEdit={() => {
              setEditingMessageId(null);
              setInput('');
            }}
          />
        </footer>
      </main>
    </div>
  );
}
