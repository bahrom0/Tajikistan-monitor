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
