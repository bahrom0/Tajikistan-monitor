const BULLET_PATTERN = /^[-*+]\s+(.+)$/;
const ORDERED_PATTERN = /^(\d+)[.)]\s+(.+)$/;

export function normalizeAiMarkdown(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+(?=\*\*[^*\n]+:\*\*)/g, '\n\n')
    .replace(/[ \t]+(?=[-*+]\s+\S)/g, '\n')
    .replace(/[ \t]+(?=\d+[.)]\s+\S)/g, '\n')
    .replace(/;\s*(?=[-*+]\s+\S)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseMarkdownBlocks(value) {
  const lines = normalizeAiMarkdown(value).split('\n');
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    const bullet = BULLET_PATTERN.exec(line);
    const ordered = ORDERED_PATTERN.exec(line);
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

    if (/^>\s?/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '') });
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}
