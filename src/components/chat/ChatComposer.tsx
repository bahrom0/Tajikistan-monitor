import { useEffect, useRef } from 'preact/hooks';
import type { ChatModes } from '../../types/chat';
import {
  SendIcon,
  StopIcon,
  CloseIcon,
  GlobeIcon,
  BrainIcon,
  DatabaseIcon,
  ShieldCheckIcon,
} from '../icons';

interface ChatComposerProps {
  input: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  modes: ChatModes;
  onToggleMode: (modeKey: keyof ChatModes) => void;
  language: 'ru' | 'tg';
  editingMessageId?: string | null;
  onCancelEdit?: () => void;
}

export function ChatComposer({
  input,
  onInputChange,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  modes,
  onToggleMode,
  language,
  editingMessageId,
  onCancelEdit,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTg = language === 'tg';

  // Auto-grow textarea height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 220);
    textarea.style.height = `${nextHeight}px`;
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      if (input.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div class="chat-composer-container">
      {editingMessageId && (
        <div class="chat-composer-edit-banner">
          <span>{isTg ? 'Таҳрири паём' : 'Редактирование сообщения'}</span>
          <button
            type="button"
            class="chat-composer-cancel-edit"
            onClick={onCancelEdit}
            title={isTg ? 'Бекор кардан' : 'Отменить'}
          >
            <CloseIcon size={14} />
            <span>{isTg ? 'Бекор кардан' : 'Отмена'}</span>
          </button>
        </div>
      )}

      <div class={`chat-composer-box${isStreaming ? ' is-streaming' : ''}`}>
        <textarea
          ref={textareaRef}
          class="chat-composer-textarea"
          value={input}
          onInput={(e) => onInputChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isTg
              ? 'Саволе диҳед ё мавзӯъро шарҳ диҳед… (Shift+Enter барои сатри нав)'
              : 'Спросите что угодно о Таджикистане… (Shift+Enter для новой строки)'
          }
          disabled={disabled && !isStreaming}
          rows={1}
        />

        <div class="chat-composer-actions-bar">
          <div class="chat-composer-tools-group">
            {/* 1. Web Search Exa */}
            <button
              type="button"
              class={`chat-tool-toggle-btn${modes.webSearch ? ' is-active' : ' is-inactive'}`}
              onClick={() => onToggleMode('webSearch')}
              title={
                isTg
                  ? 'Ҷустуҷӯи зинда дар шабакаи Интернет тавассути Exa AI'
                  : 'Живой поиск актуальной информации в Интернете через Exa AI'
              }
            >
              <GlobeIcon size={13} strokeWidth={2} />
              <span>{isTg ? 'Ҷустуҷӯ дар шабака' : 'Поиск в сети'}</span>
              <span class={`chat-tool-indicator-dot${modes.webSearch ? ' is-on' : ''}`} />
            </button>

            {/* 2. Think Mode */}
            <button
              type="button"
              class={`chat-tool-toggle-btn${modes.thinkMode ? ' is-active' : ' is-inactive'}`}
              onClick={() => onToggleMode('thinkMode')}
              title={
                isTg
                  ? 'Ҳолати тафаккури амиқ: намоиши раванди фикрронии зеҳни сунъӣ'
                  : 'Режим глубокого размышления: показ хода мыслей нейросети перед ответом'
              }
            >
              <BrainIcon size={13} strokeWidth={2} />
              <span>{isTg ? 'Андеша' : 'Раздумие'}</span>
              <span class={`chat-tool-indicator-dot${modes.thinkMode ? ' is-on' : ''}`} />
            </button>

            {/* 3. Database Search */}
            <button
              type="button"
              class={`chat-tool-toggle-btn${modes.dbSearch ? ' is-active' : ' is-inactive'}`}
              onClick={() => onToggleMode('dbSearch')}
              title={
                isTg
                  ? 'Ҷустуҷӯ танҳо дар пойгоҳи расмии хабарҳо ва шаҳрҳои Тоҷикистон'
                  : 'Поиск строго по верифицированной базе новостей и геоданных Таджикистана'
              }
            >
              <DatabaseIcon size={13} strokeWidth={2} />
              <span>{isTg ? 'Пойгоҳи маълумот' : 'Поиск по базе'}</span>
              <span class={`chat-tool-indicator-dot${modes.dbSearch ? ' is-on' : ''}`} />
            </button>

            {/* 4. Official Verified Mode */}
            <button
              type="button"
              class={`chat-tool-toggle-btn${modes.officialStrict ? ' is-active' : ' is-inactive'}`}
              onClick={() => onToggleMode('officialStrict')}
              title={
                isTg
                  ? 'Сарчашмаи расмӣ: санҷиши қатъии фактҳо ва ҷудо кардани овозаҳо'
                  : 'Официальный источник: глубокая верификация фактов, отсев фейков и слухов'
              }
            >
              <ShieldCheckIcon size={13} strokeWidth={2} />
              <span>{isTg ? 'Сарчашмаи расмӣ' : 'Официальный источник'}</span>
              <span class={`chat-tool-indicator-dot${modes.officialStrict ? ' is-on' : ''}`} />
            </button>
          </div>

          <div class="chat-composer-send-group">
            {isStreaming ? (
              <button
                type="button"
                class="chat-stop-btn"
                onClick={onStop}
                title={isTg ? 'Қатъи тавлиди ҷавоб' : 'Остановить генерацию'}
                aria-label="Остановить"
              >
                <StopIcon size={12} />
                <span>{isTg ? 'Қатъ' : 'Стоп'}</span>
              </button>
            ) : (
              <button
                type="button"
                class="chat-send-btn"
                onClick={onSend}
                disabled={!input.trim() || disabled}
                title={isTg ? 'Фиристодан' : 'Отправить (Enter)'}
                aria-label="Отправить"
              >
                <SendIcon size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div class="chat-composer-footer-note">
        {isTg
          ? 'Зеҳни сунъӣ метавонад хато кунад. Маълумоти муҳимро бо сарчашмаҳои расмӣ санҷед.'
          : 'ИИ может допускать неточности. Проверяйте важные факты по официальным ссылкам.'}
      </div>
    </div>
  );
}
