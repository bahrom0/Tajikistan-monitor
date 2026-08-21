import { useEffect, useRef, useState } from 'preact/hooks';
import type { ChatMessage, ToolCallRecord, AgentStep, ChatTimelineItem } from '../../types/chat';
import { MarkdownContent, type CitationSource } from '../MarkdownContent';
import { ChatThinkingBlock } from './ChatThinkingBlock';
import { ChatAgentStepsList } from './ChatAgentStepsList';
import {
  CopyIcon,
  CheckIcon,
  RefreshIcon,
  EditIcon,
  TrashIcon,
  AppleSpinner,
  ArrowDownIcon,
} from '../icons';

interface ChatMessageListProps {
  messages: ChatMessage[];
  streamingContent: string;
  streamingThinking: string;
  streamingSources: CitationSource[];
  streamingToolCalls: ToolCallRecord[];
  streamingAgentSteps: AgentStep[];
  streamingTimeline: ChatTimelineItem[];
  isStreaming: boolean;
  isThinkingActive: boolean;
  onRetry: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  language: 'ru' | 'tg';
  loadingMessages: boolean;
}

const INTERNAL_TOOL_MARKER_RE = /<\s*(?:[|/]\s*)*(?:DSML\b|[｜|]\s*tool\s*calls?\s*[｜|]|tool_call\b|function_call\b|invoke\s+name\s*=)/i;

function stripInternalToolMarkup(rawContent: string) {
  let content = rawContent;
  const markerIndex = content.search(INTERNAL_TOOL_MARKER_RE);
  if (markerIndex >= 0) {
    content = content.slice(0, markerIndex);
  } else {
    const lastOpen = content.lastIndexOf('<');
    if (lastOpen >= 0) {
      const compact = content
        .slice(lastOpen + 1)
        .toLowerCase()
        .replace(/[\s|｜/]/g, '')
        .replace(/-/g, '_');
      const isPartialMarker = ['dsml', 'tool_call', 'function_call', 'invoke'].some(
        (marker) => marker.startsWith(compact) || compact.startsWith(marker)
      );
      if (isPartialMarker) content = content.slice(0, lastOpen);
    }
  }

  return content
    .replace(/<\/?(?:tool_call|function_call|invoke|parameter)\b[^>]*>/gi, '')
    .trim();
}

function getStoredTimeline(message: ChatMessage): ChatTimelineItem[] {
  const candidate = message.metadata?.timeline;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is ChatTimelineItem => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    if (record.type === 'assistant') return typeof record.id === 'string' && typeof record.content === 'string';
    if (record.type !== 'tool' || typeof record.id !== 'string' || !record.toolCall || typeof record.toolCall !== 'object') {
      return false;
    }
    const toolCall = record.toolCall as Record<string, unknown>;
    return typeof toolCall.id === 'string' && typeof toolCall.name === 'string';
  });
}

function ToolActionBlock({ toolCall, isTg }: { toolCall: ToolCallRecord; isTg: boolean }) {
  const isRunning = toolCall.state === 'running';
  const isError = toolCall.state === 'error';
  return (
    <div
      class={`chat-tool-action${isRunning ? ' is-active' : ''}${isError ? ' is-error' : ''}`}
      role="status"
      aria-live="polite"
      title={toolCall.resultSummary || toolCall.label || toolCall.name}
    >
      <span class="chat-tool-action-icon">
        {isRunning ? <AppleSpinner size={14} /> : isError ? <span aria-hidden="true">!</span> : <CheckIcon size={14} />}
      </span>
      <span class="chat-tool-action-body">
        <span class="chat-tool-action-label">{toolCall.label || toolCall.name}</span>
        {toolCall.resultSummary && (
          <span class="chat-tool-action-summary">{toolCall.resultSummary}</span>
        )}
      </span>
      <span class="chat-tool-action-state">
        {isRunning ? (isTg ? 'Иҷро мешавад' : 'Выполняется') : isError ? (isTg ? 'Хато' : 'Ошибка') : (isTg ? 'Омода' : 'Готово')}
      </span>
    </div>
  );
}

function extractThinkingFromText(rawContent: string, rawThinking?: string) {
  let content = stripInternalToolMarkup(rawContent || '');
  let thinking = rawThinking || '';

  if (content.includes('<think>')) {
    content = content.replace(/<think>([\s\S]*?)<\/think>/gi, (_, thoughts) => {
      thinking = (thinking ? `${thinking}\n` : '') + thoughts.trim();
      return '';
    });
    content = content.replace(/<think>([\s\S]*)$/gi, (_, thoughts) => {
      thinking = (thinking ? `${thinking}\n` : '') + thoughts.trim();
      return '';
    });
  }

  // Defense in depth for historical messages saved before server-side filtering.
  content = content
    .replace(/<[\s|/]*DSML[\s|/]*toolcalls>[\s\S]*?<[\s|/]*DSML[\s|/]*toolcalls>/gi, '')
    .replace(/<[\s|/]*DSML[\s\S]*?>/gi, '')
    .replace(/<[｜|][\s\S]*?[｜|]>/gi, '')
    .replace(/<\/think>/gi, '')
    .trim();

  return {
    content,
    thinking: thinking.trim() || undefined,
  };
}

export function ChatMessageList({
  messages,
  streamingContent,
  streamingThinking,
  streamingSources,
  streamingToolCalls,
  streamingAgentSteps,
  streamingTimeline,
  isStreaming,
  isThinkingActive,
  onRetry,
  onEdit,
  onDelete,
  language,
  loadingMessages,
}: ChatMessageListProps) {
  const isTg = language === 'tg';
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Check scroll position
  const handleScroll = () => {
    const el = scrollViewportRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceToBottom < 80;
    setIsAtBottom(nearBottom);
    setShowScrollBottomBtn(!nearBottom && el.scrollHeight > el.clientHeight + 100);
  };

  const scrollToBottom = (smooth = true) => {
    const el = scrollViewportRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  // Auto-scroll when new streaming content arrives if user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom(false);
    }
  }, [streamingContent, streamingThinking, streamingAgentSteps, streamingTimeline, messages, isAtBottom]);

  // Scroll to bottom on initial message load
  useEffect(() => {
    if (!loadingMessages && messages.length > 0) {
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [loadingMessages, messages.length]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  if (loadingMessages && messages.length === 0 && !isStreaming) {
    return (
      <div class="chat-messages-loader-stage">
        <AppleSpinner size={32} />
      </div>
    );
  }

  // Parse live stream content to ensure think tags never appear
  const liveParsed = extractThinkingFromText(streamingContent, streamingThinking);

  return (
    <div class="chat-messages-viewport" ref={scrollViewportRef} onScroll={handleScroll}>
      <div class="chat-messages-inner-container">
        {messages.map((msg, index) => {
          const isUser = msg.role === 'user';
          const isCopied = copiedId === msg.id;

          if (isUser) {
            return (
              <div key={msg.id} class="chat-msg-row is-user">
                <div class="chat-user-bubble-container">
                  <div class="chat-user-bubble">
                    <p>{msg.content}</p>
                  </div>
                  <div class="chat-msg-actions user-actions">
                    <button
                      type="button"
                      class="chat-action-btn"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      title={isTg ? 'Нусхабардорӣ' : 'Копировать'}
                    >
                      {isCopied ? <CheckIcon size={13} strokeWidth={2.5} class="text-success" /> : <CopyIcon size={13} />}
                    </button>
                    <button
                      type="button"
                      class="chat-action-btn"
                      onClick={() => onEdit(msg.id, msg.content)}
                      title={isTg ? 'Таҳрир' : 'Редактировать'}
                    >
                      <EditIcon size={13} />
                    </button>
                    <button
                      type="button"
                      class="chat-action-btn danger"
                      onClick={() => onDelete(msg.id)}
                      title={isTg ? 'Нест кардан' : 'Удалить'}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // Assistant message - sanitize think tags from display
          const parsed = extractThinkingFromText(msg.content, msg.thinking_content);
          const timeline = getStoredTimeline(msg);

          return (
            <div key={msg.id} class="chat-msg-row is-assistant">
              <div class="chat-assistant-container">
                {/* Agent multi-step history chips */}
                {timeline.length === 0 && msg.agent_steps && msg.agent_steps.length > 0 && (
                  <ChatAgentStepsList steps={msg.agent_steps} isStreaming={false} />
                )}

                {/* Collapsible Thinking Chain */}
                {parsed.thinking && (
                  <ChatThinkingBlock
                    thinkingContent={parsed.thinking}
                    isStreaming={false}
                    isThinkingActive={false}
                  />
                )}

                {/* Message Markdown Content */}
                {timeline.length > 0 ? (
                  <div class="chat-response-timeline">
                    {timeline.map((item) => item.type === 'assistant' ? (
                      <MarkdownContent
                        key={item.id}
                        content={extractThinkingFromText(item.content).content}
                        sources={msg.sources || []}
                      />
                    ) : (
                      <ToolActionBlock key={item.id} toolCall={item.toolCall} isTg={isTg} />
                    ))}
                  </div>
                ) : (
                  <MarkdownContent content={parsed.content} sources={msg.sources || []} />
                )}

                {/* Bottom action bar */}
                <div class="chat-msg-actions assistant-actions">
                  <button
                    type="button"
                    class="chat-action-btn"
                    onClick={() => handleCopy(msg.id, parsed.content)}
                    title={isTg ? 'Нусхабардорӣ' : 'Копировать ответ'}
                  >
                    {isCopied ? (
                      <>
                        <CheckIcon size={13} strokeWidth={2.5} class="text-success" />
                        <span>{isTg ? 'Нусха шуд' : 'Скопировано'}</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={13} />
                        <span>{isTg ? 'Нусха' : 'Копировать'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    class="chat-action-btn"
                    onClick={() => onRetry(msg.id)}
                    title={isTg ? 'Аз нав кӯшиш кардан' : 'Сгенерировать заново'}
                  >
                    <RefreshIcon size={13} />
                    <span>{isTg ? 'Аз нав' : 'Повторить'}</span>
                  </button>

                  <button
                    type="button"
                    class="chat-action-btn danger"
                    onClick={() => onDelete(msg.id)}
                    title={isTg ? 'Нест кардан' : 'Удалить'}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Live Streaming Assistant Message */}
        {isStreaming && (
          <div class="chat-msg-row is-assistant is-streaming-row">
            <div class="chat-assistant-container">
              {/* Agent multi-step live tracker */}
              {streamingTimeline.length === 0 && streamingAgentSteps.length > 0 && (
                <ChatAgentStepsList steps={streamingAgentSteps} isStreaming={true} />
              )}

              {/* Collapsible Thinking Chain in progress */}
              {(liveParsed.thinking || isThinkingActive) && (
                <ChatThinkingBlock
                  thinkingContent={liveParsed.thinking}
                  isStreaming={true}
                  isThinkingActive={isThinkingActive}
                />
              )}

              {/* Streaming Content */}
              {streamingTimeline.length > 0 ? (
                <div class="chat-response-timeline">
                  {streamingTimeline.map((item) => item.type === 'assistant' ? (
                    <MarkdownContent
                      key={item.id}
                      content={extractThinkingFromText(item.content).content}
                      sources={streamingSources}
                    />
                  ) : (
                    <ToolActionBlock key={item.id} toolCall={item.toolCall} isTg={isTg} />
                  ))}
                </div>
              ) : liveParsed.content ? (
                <MarkdownContent content={liveParsed.content} sources={streamingSources} />
              ) : !liveParsed.thinking && !streamingAgentSteps.length ? (
                <div class="chat-streaming-thinking-indicator">
                  <AppleSpinner size={16} />
                  <span>{isTg ? 'Иттилоот таҳлил шуда истодааст…' : 'ИИ формирует ответ…'}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Bottom Pill */}
      {showScrollBottomBtn && (
        <button
          type="button"
          class="chat-scroll-bottom-pill"
          onClick={() => scrollToBottom(true)}
          title={isTg ? 'Ба поён' : 'Прокрутить вниз'}
          aria-label="Вниз"
        >
          <ArrowDownIcon size={15} />
        </button>
      )}
    </div>
  );
}
