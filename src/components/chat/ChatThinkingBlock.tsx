import { useState } from 'preact/hooks';
import { BrainIcon, ChevronDownIcon, AppleSpinner } from '../icons';

interface ChatThinkingBlockProps {
  thinkingContent?: string;
  isStreaming?: boolean;
  isThinkingActive?: boolean;
}

export function ChatThinkingBlock({
  thinkingContent = '',
  isStreaming = false,
  isThinkingActive = false,
}: ChatThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!thinkingContent && !isThinkingActive) {
    return null;
  }

  return (
    <div class={`chat-thinking-container${isThinkingActive ? ' is-active' : ''}`}>
      <button
        type="button"
        class="chat-thinking-header"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div class="chat-thinking-title-wrap">
          <span class="chat-thinking-icon-badge">
            <BrainIcon size={14} />
          </span>
          <span class="chat-thinking-title">
            {isThinkingActive ? 'Размышления нейросети...' : 'Ход мыслей нейросети'}
          </span>
          {isThinkingActive && (
            <span class="chat-thinking-pulse-dot" />
          )}
        </div>
        <div class="chat-thinking-controls">
          {isThinkingActive && <AppleSpinner size={13} />}
          <span class={`chat-thinking-chevron${isOpen ? ' is-open' : ''}`}>
            <ChevronDownIcon size={14} />
          </span>
        </div>
      </button>

      {isOpen && (
        <div class="chat-thinking-content-body">
          <div class="chat-thinking-inner-text">
            {thinkingContent || 'Анализ намерения, выбор стратегии и проверка данных...'}
          </div>
        </div>
      )}
    </div>
  );
}
