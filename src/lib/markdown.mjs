const BULLET_PATTERN = /^[-*+]\s+(.+)$/;
const ORDERED_PATTERN = /^(\d+)[.)]\s+(.+)$/;
const TASK_PATTERN = /^[-*+]\s+\[([ xX])\]\s+(.+)$/;
const HR_PATTERN = /^(?:---|\*\*\*|___)\s*$/;
const FENCE_PATTERN = /^```/;
const TABLE_DIVIDER_CELL_PATTERN = /^:?-{3,}:?$/;

function splitTableRow(line) {
  let value = String(line ?? '').trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);

  const cells = [];
  let cell = '';
  let escaped = false;
  let inCode = false;

  for (const char of value) {
    if (escaped) {
      cell += char === '|' ? '|' : `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '`') {
      inCode = !inCode;
      cell += char;
      continue;
    }
    if (char === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }

  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => TABLE_DIVIDER_CELL_PATTERN.test(cell));
}

function isTableCandidate(line) {
  return splitTableRow(line).length >= 2;
}

function normalizeTableCells(cells, columnCount) {
  if (cells.length > columnCount) {
    return [...cells.slice(0, columnCount - 1), cells.slice(columnCount - 1).join(' | ')];
  }
  return [...cells, ...Array(Math.max(0, columnCount - cells.length)).fill('')];
}

export function normalizeAiMarkdown(value) {
  const rawLines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const normalizedLines = [];
  let inFence = false;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();

    if (FENCE_PATTERN.test(trimmed)) {
      inFence = !inFence;
      normalizedLines.push(rawLine);
      continue;
    }

    // Code and possible table rows must never pass through list-recovery heuristics.
    if (inFence || isTableCandidate(trimmed)) {
      normalizedLines.push(rawLine);
      continue;
    }

    // Recover a heading joined to prose by a streaming provider, with or without a space.
    const joinedHeading = trimmed.startsWith('#')
      ? null
      : /^(.*?\S)[ \t]*(#{1,6}\s+\S.*)$/.exec(rawLine);
    if (joinedHeading) {
      normalizedLines.push(joinedHeading[1], '', joinedHeading[2]);
      continue;
    }

    // Headings must remain intact and may arrive without the CommonMark space.
    if (/^#{1,6}(?:\s|$|[^\s#])/.test(trimmed)) {
      normalizedLines.push(trimmed.replace(/^(#{1,6})([^\s#])/, '$1 $2'));
      continue;
    }

    let line = rawLine;
    line = line.replace(/([.!?:\s])[ \t]+(?=\*\*[^*\n]+:\*\*)/g, '$1\n\n');
    line = line.replace(/;\s*(?=[-+*]\s+\S)/g, '\n');
    line = line.replace(/([.!?:])[ \t]+(?=[-+*]\s+(?:\[[ xX]\]\s+)?\S)/g, '$1\n');

    // Limit recovered inline item numbers to 1–99 so years such as "2026)" stay prose.
    line = line.replace(/([.!?:;])[ \t]+(?=(?:[1-9]|[1-9]\d)[.)]\s+\S)/g, '$1\n');
    line = line.replace(/([^\d\s])[ \t]+(?=(?:[1-9]|[1-9]\d)[.)]\s+\S)/g, '$1\n');
    normalizedLines.push(line);
  }

  return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function parseMarkdownBlocks(value) {
  const normalized = normalizeAiMarkdown(value);
  const lines = normalized.split('\n');
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (let index = 0; index < lines.length;) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (HR_PATTERN.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    const codeFenceMatch = /^```([a-zA-Z0-9_-]*)/.exec(trimmed);
    if (codeFenceMatch) {
      flushParagraph();
      const language = codeFenceMatch[1] || 'text';
      index += 1;
      const codeLines = [];
      while (index < lines.length) {
        if (/^```\s*$/.test(lines[index].trim())) {
          index += 1;
          break;
        }
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    const heading = /^(#{1,6})(?:\s+(.+)|([^\s#].*))$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      const text = (heading[2] || heading[3] || '').replace(/\s+#+\s*$/, '').trim();
      if (text) {
        blocks.push({ type: 'heading', level: heading[1].length, text });
        index += 1;
        continue;
      }
    }

    const loneHeadingMatch = /^(#{1,6})\s*$/.exec(trimmed);
    if (loneHeadingMatch) {
      flushParagraph();
      let nextIndex = index + 1;
      while (nextIndex < lines.length && !lines[nextIndex].trim()) nextIndex += 1;
      const nextTrimmed = (lines[nextIndex] || '').trim();
      if (
        nextTrimmed &&
        !HR_PATTERN.test(nextTrimmed) &&
        !FENCE_PATTERN.test(nextTrimmed) &&
        !/^#{1,6}(?:\s|$)/.test(nextTrimmed)
      ) {
        blocks.push({ type: 'heading', level: loneHeadingMatch[1].length, text: nextTrimmed });
        index = nextIndex + 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (isTableCandidate(trimmed) && isTableDivider((lines[index + 1] || '').trim())) {
      flushParagraph();
      const headers = splitTableRow(trimmed);
      const dividerCells = normalizeTableCells(splitTableRow(lines[index + 1]), headers.length);
      const alignments = dividerCells.map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        return 'left';
      });

      index += 2;
      const rows = [];
      while (index < lines.length) {
        const rowLine = lines[index].trim();
        if (!rowLine || !isTableCandidate(rowLine) || isTableDivider(rowLine)) break;
        rows.push(normalizeTableCells(splitTableRow(rowLine), headers.length));
        index += 1;
      }
      blocks.push({ type: 'table', headers, alignments, rows });
      continue;
    }

    const taskMatch = TASK_PATTERN.exec(trimmed);
    if (taskMatch) {
      flushParagraph();
      const items = [];
      while (index < lines.length) {
        const match = TASK_PATTERN.exec(lines[index].trim());
        if (!match) break;
        items.push({ checked: match[1].toLowerCase() === 'x', text: match[2].replace(/;$/, '') });
        index += 1;
      }
      blocks.push({ type: 'task-list', items });
      continue;
    }

    const bullet = BULLET_PATTERN.exec(trimmed);
    const ordered = ORDERED_PATTERN.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph();
      const type = ordered ? 'ordered-list' : 'unordered-list';
      const items = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const match = type === 'ordered-list' ? ORDERED_PATTERN.exec(candidate) : BULLET_PATTERN.exec(candidate);
        if (!match) break;
        items.push(match[match.length - 1].replace(/;$/, ''));
        index += 1;
      }
      blocks.push({ type, items });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}
