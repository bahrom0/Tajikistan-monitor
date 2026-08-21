import { useMemo, useState } from 'preact/hooks';
import type { Conversation, DateGroup, DateGroupId } from '../../types/chat';
import {
  PlusIcon,
  SearchIcon,
  PinIcon,
  EditIcon,
  TrashIcon,
  MessageSquareIcon,
  AppleSpinner,
  CloseIcon,
  CheckIcon,
} from '../icons';

interface ChatSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, currentPin: boolean) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
  language: 'ru' | 'tg';
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onRename,
  onDelete,
  onTogglePin,
  searchQuery,
  onSearchChange,
  loading,
  language,
  isMobileOpen = false,
  onCloseMobile,
}: ChatSidebarProps) {
  const isTg = language === 'tg';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Group conversations by date
  const { pinnedList, groups } = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayMidnight = todayMidnight - 86400000;
    const weekMidnight = todayMidnight - 7 * 86400000;

    const pinned: Conversation[] = [];
    const todayList: Conversation[] = [];
    const yesterdayList: Conversation[] = [];
    const weekList: Conversation[] = [];
    const olderList: Conversation[] = [];

    for (const c of conversations) {
      if (c.pinned) {
        pinned.push(c);
        continue;
      }
      const time = Date.parse(c.updated_at || c.created_at);
      if (time >= todayMidnight) {
        todayList.push(c);
      } else if (time >= yesterdayMidnight) {
        yesterdayList.push(c);
      } else if (time >= weekMidnight) {
        weekList.push(c);
      } else {
        olderList.push(c);
      }
    }

    const groupDefs: DateGroup[] = [
      { id: 'today' as DateGroupId, labelRu: 'Сегодня', labelTg: 'Имрӯз', conversations: todayList },
      { id: 'yesterday' as DateGroupId, labelRu: 'Вчера', labelTg: 'Дирӯз', conversations: yesterdayList },
      { id: 'week' as DateGroupId, labelRu: 'Предыдущие 7 дней', labelTg: '7 рӯзи гузашта', conversations: weekList },
      { id: 'older' as DateGroupId, labelRu: 'Ранее', labelTg: 'Пештар', conversations: olderList },
    ];

    return {
      pinnedList: pinned,
      groups: groupDefs.filter((g) => g.conversations.length > 0),
    };
  }, [conversations]);

  const handleStartEdit = (c: Conversation, e: MouseEvent) => {
    e.stopPropagation();
    setEditingId(c.id);
    setEditTitle(c.title);
    setDeleteConfirmId(null);
  };

  const handleSaveEdit = (id: string, e?: Event) => {
    e?.stopPropagation();
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleStartDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(id);
    setEditingId(null);
  };

  const handleConfirmDelete = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
    setDeleteConfirmId(null);
  };

  const renderConversationItem = (c: Conversation) => {
    const isActive = c.id === activeId;
    const isEditing = editingId === c.id;
    const isDeleting = deleteConfirmId === c.id;

    if (isEditing) {
      return (
        <div key={c.id} class="chat-conv-item is-editing">
          <input
            type="text"
            class="chat-conv-edit-input"
            value={editTitle}
            onInput={(e) => setEditTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit(c.id);
              if (e.key === 'Escape') setEditingId(null);
            }}
            autoFocus
          />
          <div class="chat-conv-edit-actions">
            <button
              type="button"
              class="chat-item-action-btn check"
              onClick={(e) => handleSaveEdit(c.id, e)}
              title="Сохранить"
            >
              <CheckIcon size={13} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              class="chat-item-action-btn cancel"
              onClick={(e) => {
                e.stopPropagation();
                setEditingId(null);
              }}
              title="Отмена"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      );
    }

    if (isDeleting) {
      return (
        <div key={c.id} class="chat-conv-item is-deleting">
          <span class="chat-conv-delete-prompt">
            {isTg ? 'Нест карда шавад?' : 'Удалить диалог?'}
          </span>
          <div class="chat-conv-edit-actions">
            <button
              type="button"
              class="chat-item-action-btn danger"
              onClick={(e) => handleConfirmDelete(c.id, e)}
              title="Да, удалить"
            >
              {isTg ? 'Ҳа' : 'Да'}
            </button>
            <button
              type="button"
              class="chat-item-action-btn cancel"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirmId(null);
              }}
              title="Отмена"
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={c.id}
        class={`chat-conv-item${isActive ? ' is-active' : ''}`}
        onClick={() => {
          onSelect(c.id);
          onCloseMobile?.();
        }}
        role="button"
        tabIndex={0}
      >
        <MessageSquareIcon size={15} class="chat-conv-icon" />
        <span class="chat-conv-title" title={c.title}>
          {c.title || (isTg ? 'Гуфтугӯи нав' : 'Новый разговор')}
        </span>

        <div class="chat-conv-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            class={`chat-item-action-btn pin${c.pinned ? ' is-pinned' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(c.id, c.pinned);
            }}
            title={c.pinned ? (isTg ? 'Кушодан' : 'Открепить') : isTg ? 'Маҳкам кардан' : 'Закрепить'}
          >
            <PinIcon size={13} />
          </button>
          <button
            type="button"
            class="chat-item-action-btn"
            onClick={(e) => handleStartEdit(c, e)}
            title={isTg ? 'Ивази ном' : 'Переименовать'}
          >
            <EditIcon size={13} />
          </button>
          <button
            type="button"
            class="chat-item-action-btn danger"
            onClick={(e) => handleStartDelete(c.id, e)}
            title={isTg ? 'Нест кардан' : 'Удалить'}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <aside class={`chat-history-sidebar${isMobileOpen ? ' is-mobile-open' : ''}`}>
      <div class="chat-sidebar-header">
        <button
          type="button"
          class="chat-new-chat-btn"
          onClick={() => {
            onNewChat();
            onCloseMobile?.();
          }}
        >
          <PlusIcon size={16} strokeWidth={2.2} />
          <span>{isTg ? 'Гуфтугӯи нав' : 'Новый чат'}</span>
        </button>

        {isMobileOpen && (
          <button
            type="button"
            class="chat-sidebar-close-mobile-btn"
            onClick={onCloseMobile}
            aria-label="Закрыть"
          >
            <CloseIcon size={18} />
          </button>
        )}
      </div>

      <div class="chat-sidebar-search">
        <div class="chat-search-input-wrap">
          <SearchIcon size={14} class="chat-search-icon" />
          <input
            type="search"
            class="chat-search-input"
            value={searchQuery}
            onInput={(e) => onSearchChange(e.currentTarget.value)}
            placeholder={isTg ? 'Ҷустуҷӯи гуфтугӯҳо…' : 'Поиск диалогов…'}
          />
          {searchQuery && (
            <button
              type="button"
              class="chat-search-clear"
              onClick={() => onSearchChange('')}
              aria-label="Очистить"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      </div>

      <div class="chat-sidebar-scroll-list">
        {loading && !conversations.length ? (
          <div class="chat-sidebar-loader">
            <AppleSpinner size={24} />
          </div>
        ) : (
          <>
            {pinnedList.length > 0 && (
              <div class="chat-date-group">
                <div class="chat-date-group-header">
                  <PinIcon size={12} />
                  <span>{isTg ? 'Маҳкамшуда' : 'Закрепленные'}</span>
                </div>
                <div class="chat-date-group-items">
                  {pinnedList.map(renderConversationItem)}
                </div>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.id} class="chat-date-group">
                <div class="chat-date-group-header">
                  <span>{isTg ? group.labelTg : group.labelRu}</span>
                </div>
                <div class="chat-date-group-items">
                  {group.conversations.map(renderConversationItem)}
                </div>
              </div>
            ))}

            {!loading && conversations.length === 0 && (
              <div class="chat-sidebar-empty">
                <p>{isTg ? 'Гуфтугӯе ёфт нашуд' : 'История диалогов пуста'}</p>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
