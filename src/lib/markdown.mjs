const BULLET_PATTERN = /^[-*+]\s+(.+)$/;
const ORDERED_PATTERN = /^(\d+)[.)]\s+(.+)$/;
const TASK_PATTERN = /^[-*+]\s+\[([ xX])\]\s+(.+)$/;
const HR_PATTERN = /^(?:---|\*\*\*|___)\s*$/;

export function normalizeAiMarkdown(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+(?=\*\*[^*\n]+:\*\*)/g, '\n\n')
    .replace(/[ \t]+(?=[-+\*]\s+(?:\[[ xX]\]\s+)?\S)/g, '\n')
    .replace(/[ \t]+(?=\d+[.)]\s+\S)/g, '\n')
    .replace(/;\s*(?=[-+\*]\s+\S)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (HR_PATTERN.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    // Fenced Code Block
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

    // Heading (# to ######)
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    // Table detection: line starts with '|' and contains '|'
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|')) {
      const nextLine = (lines[index + 1] || '').trim();
      const isDivider = nextLine.startsWith('|') && /^\|[\s-:]+(\|[\s-:]+)+\|?$/.test(nextLine);
      if (isDivider) {
        flushParagraph();
        const headerCells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
        const dividerParts = nextLine.slice(1, -1).split('|').map((c) => c.trim());
        const alignments = dividerParts.map((d) => {
          const left = d.startsWith(':');
          const right = d.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        index += 2; // skip header and divider
        const rows = [];
        while (index < lines.length) {
          const rowLine = lines[index].trim();
          if (!rowLine.startsWith('|') || !rowLine.endsWith('|')) break;
          const cells = rowLine.slice(1, -1).split('|').map((c) => c.trim());
          rows.push(cells);
          index += 1;
        }
        blocks.push({ type: 'table', headers: headerCells, alignments, rows });
        continue;
      }
    }

    // Task List (- [ ] or - [x])
    const taskMatch = TASK_PATTERN.exec(trimmed);
    if (taskMatch) {
      flushParagraph();
      const items = [];
      while (index < lines.length) {
        const candidate = lines[index].trim();
        const match = TASK_PATTERN.exec(candidate);
        if (!match) break;
        items.push({
          checked: match[1].toLowerCase() === 'x',
          text: match[2].replace(/;$/, ''),
        });
        index += 1;
      }
      blocks.push({ type: 'task-list', items });
      continue;
    }

    // Standard Lists
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

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s?/, '') });
      index += 1;
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}
