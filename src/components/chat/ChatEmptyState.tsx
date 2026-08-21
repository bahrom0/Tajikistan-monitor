interface ChatEmptyStateProps {
  onSelectSuggestion: (text: string) => void;
  language: 'ru' | 'tg';
}

export function ChatEmptyState({ onSelectSuggestion, language }: ChatEmptyStateProps) {
  const isTg = language === 'tg';

  const suggestions = isTg
    ? [
        {
          title: 'Ахбори Душанбе',
          desc: 'Сводкаи охирини пойтахт',
          prompt: 'Дар бораи рӯйдодҳои охирини Душанбе маълумот бидеҳ.',
        },
        {
          title: 'Огоҳиҳои КҲФ',
          desc: 'Ҳолатҳои фавқулодда',
          prompt: 'Огоҳиҳо ва хабарҳои охирини Кумитаи ҳолатҳои фавқулодда кадоманд?',
        },
        {
          title: 'Қурби асъор',
          desc: 'Қурби Бонки миллӣ',
          prompt: 'Қурби расмии доллар ва дигар асъорҳо аз рӯи Бонки миллии Тоҷикистон чӣ гуна аст?',
        },
        {
          title: 'Обу ҳаво дар минтақаҳо',
          desc: 'Пешгӯии обу ҳаво',
          prompt: 'Вазъияти обу ҳаво ва огоҳиҳои метеорологӣ дар вилоятҳои Тоҷикистон чӣ гуна аст?',
        },
      ]
    : [
        {
          title: 'События в Душанбе',
          desc: 'Последние сводки столицы',
          prompt: 'Какие важные события и новости произошли сегодня в Душанбе?',
        },
        {
          title: 'Предупреждения КЧС',
          desc: 'Чрезвычайные ситуации',
          prompt: 'Какие последние оперативные предупреждения и сводки опубликовал КЧС Таджикистана?',
        },
        {
          title: 'Курс валют НБТ',
          desc: 'Официальные курсы',
          prompt: 'Какой официальный курс доллара и других валют по данным Национального банка Таджикистана?',
        },
        {
          title: 'Погода по регионам',
          desc: 'Метеосводка Гидромета',
          prompt: 'Какая текущая погода и метеопрогноз в областях и городах Таджикистана?',
        },
      ];

  return (
    <div class="chat-empty-state">
      <div class="chat-empty-brand">
        <div class="chat-empty-logo-wrap">
          <img src="/logo.png" alt="Tajikistan Monitor" class="chat-empty-logo" />
        </div>
        <h2 class="chat-empty-title">
          {isTg ? 'Чӣ тавр метавонам кумак кунам?' : 'Чем я могу помочь?'}
        </h2>
        <p class="chat-empty-subtitle">
          {isTg
            ? 'Ёрдамчии зеҳни сунъӣ барои таҳлили ахбор, ҷуғрофия, иқтисод ва обу ҳавои Тоҷикистон'
            : 'Интеллектуальный ассистент по новостям, географии, экономике и событиям Таджикистана'}
        </p>
      </div>

      <div class="chat-suggestions-grid">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            type="button"
            class="chat-suggestion-chip"
            onClick={() => onSelectSuggestion(item.prompt)}
          >
            <strong class="chat-suggestion-title">{item.title}</strong>
            <span class="chat-suggestion-desc">{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
