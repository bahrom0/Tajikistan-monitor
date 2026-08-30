import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAiMarkdown, parseMarkdownBlocks } from '../src/lib/markdown.mjs';

test('AI markdown normalizer restores inline sections and bullet lists', () => {
  const input = '**Факты:** Текст: * Первый пункт; * Второй пункт. **Итог:** Осторожно.';
  const normalized = normalizeAiMarkdown(input);
  assert.match(normalized, /Текст:\n\* Первый пункт/);
  assert.match(normalized, /\n\n\*\*Итог:\*\*/);
  assert.deepEqual(parseMarkdownBlocks(input), [
    { type: 'paragraph', text: '**Факты:** Текст:' },
    { type: 'unordered-list', items: ['Первый пункт', 'Второй пункт.'] },
    { type: 'paragraph', text: '**Итог:** Осторожно.' },
  ]);
});

test('markdown parser keeps headings, ordered lists and quotes structured', () => {
  assert.deepEqual(parseMarkdownBlocks('## Раздел\n1. Один\n2. Два\n\n> Важно'), [
    { type: 'heading', level: 2, text: 'Раздел' },
    { type: 'ordered-list', items: ['Один', 'Два'] },
    { type: 'quote', text: 'Важно' },
  ]);
});

test('markdown parser handles numbered headings and preserves their title structure', () => {
  const input = `... поэтому мотивация была максимальной.

### 1. Простая партнёрская модель
Официальным партнёром выступил **государственный «Таджиктелеком»**.

### 1. Почему Кыргызстан задержался
- В августе 2025 года Кыргызстан ввёл монополию
- Вопросы безопасности решались дольше в мае 2026. ### 1. Почему Узбекистан — самый осторожный
Финальный текст.`;

  const blocks = parseMarkdownBlocks(input);

  assert.deepEqual(blocks[0], {
    type: 'paragraph',
    text: '... поэтому мотивация была максимальной.',
  });
  assert.deepEqual(blocks[1], {
    type: 'heading',
    level: 3,
    text: '1. Простая партнёрская модель',
  });
  assert.deepEqual(blocks[2], {
    type: 'paragraph',
    text: 'Официальным партнёром выступил **государственный «Таджиктелеком»**.',
  });
  assert.deepEqual(blocks[3], {
    type: 'heading',
    level: 3,
    text: '1. Почему Кыргызстан задержался',
  });
  assert.deepEqual(blocks[4], {
    type: 'unordered-list',
    items: [
      'В августе 2025 года Кыргызстан ввёл монополию',
      'Вопросы безопасности решались дольше в мае 2026.',
    ],
  });
  assert.deepEqual(blocks[5], {
    type: 'heading',
    level: 3,
    text: '1. Почему Узбекистан — самый осторожный',
  });
  assert.deepEqual(blocks[6], {
    type: 'paragraph',
    text: 'Финальный текст.',
  });
});

test('markdown parser handles headings without space and lone heading hashes on separate line', () => {
  const input = '###Заголовок без пробела\nТекст\n\n###\n1. Заголовок на следующей строке\nОписание';
  const blocks = parseMarkdownBlocks(input);

  assert.deepEqual(blocks, [
    { type: 'heading', level: 3, text: 'Заголовок без пробела' },
    { type: 'paragraph', text: 'Текст' },
    { type: 'heading', level: 3, text: '1. Заголовок на следующей строке' },
    { type: 'paragraph', text: 'Описание' },
  ]);
});

test('markdown parser does not turn a year in a table cell into an ordered list', () => {
  const input = `| Страна | Ключевая дата | Статус |
|---|---|---|
| Узбекистан | ожидается к концу 2026 | Сроки переносились (2023 → 2025 → 2026) [W4] |

### Почему Таджикистан обогнал соседей`;

  assert.deepEqual(parseMarkdownBlocks(input), [
    {
      type: 'table',
      headers: ['Страна', 'Ключевая дата', 'Статус'],
      alignments: ['left', 'left', 'left'],
      rows: [['Узбекистан', 'ожидается к концу 2026', 'Сроки переносились (2023 → 2025 → 2026) [W4]']],
    },
    { type: 'heading', level: 3, text: 'Почему Таджикистан обогнал соседей' },
  ]);
});

test('markdown parser accepts GFM tables without outer pipes and escaped cell pipes', () => {
  const input = `Страна | Дата | Статус
:--- | :---: | ---:
Таджикистан | 5 февраля | Запущен \\| подтвержден
Узбекистан | конец 2026 | Ожидается`;

  assert.deepEqual(parseMarkdownBlocks(input), [
    {
      type: 'table',
      headers: ['Страна', 'Дата', 'Статус'],
      alignments: ['left', 'center', 'right'],
      rows: [
        ['Таджикистан', '5 февраля', 'Запущен | подтвержден'],
        ['Узбекистан', 'конец 2026', 'Ожидается'],
      ],
    },
  ]);
});

test('markdown normalizer leaves fenced code and table syntax untouched', () => {
  const input = `\`\`\`md
Текст: 1. не список
| a | b |
\`\`\`

| Год | Значение |
| --- | --- |
| 2026 | план (2026) [W1] |`;

  assert.match(normalizeAiMarkdown(input), /Текст: 1\. не список/);
  assert.deepEqual(parseMarkdownBlocks(input), [
    { type: 'code', language: 'md', code: 'Текст: 1. не список\n| a | b |' },
    {
      type: 'table',
      headers: ['Год', 'Значение'],
      alignments: ['left', 'left'],
      rows: [['2026', 'план (2026) [W1]']],
    },
  ]);
});

test('markdown parser parses task list items cleanly without stripping text', () => {
  const input = `### 3. Тактика на экзаменах: как не дать себя «завалить»
- [x] **Сдавайте работы с копией.** Приносите черновик/копию своей работы
- [x] **Приходите на экзамен с одногруппником.** Если преподаватель хочет «завалить»
- [ ] **Не пропускайте пары вообще.** Посещаемость — ваш щит`;

  const blocks = parseMarkdownBlocks(input);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].text, '3. Тактика на экзаменах: как не дать себя «завалить»');
  assert.equal(blocks[1].type, 'task-list');
  assert.equal(blocks[1].items.length, 3);
  assert.equal(blocks[1].items[0].checked, true);
  assert.match(blocks[1].items[0].text, /Сдавайте работы с копией/);
  assert.equal(blocks[1].items[2].checked, false);
});
