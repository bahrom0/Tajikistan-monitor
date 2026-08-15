import { Fragment, type ComponentChildren } from 'preact';
import { parseMarkdownBlocks } from '../lib/markdown.mjs';

interface MarkdownContentProps {
  content: string;
}

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

function renderInline(text: string, keyPrefix: string): ComponentChildren[] {
  const parts = text.split(INLINE_TOKEN).filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(content);

  return <div class="markdown-content">
    {blocks.map((block, index) => {
      const key = `block-${index}`;
      if (block.type === 'heading') {
        if (block.level === 1) return <h3 key={key}>{renderInline(block.text, key)}</h3>;
        if (block.level === 2) return <h4 key={key}>{renderInline(block.text, key)}</h4>;
        return <h5 key={key}>{renderInline(block.text, key)}</h5>;
      }
      if (block.type === 'quote') return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
      if (block.type === 'paragraph') return <p key={key}>{renderInline(block.text, key)}</p>;

      const List = block.type === 'ordered-list' ? 'ol' : 'ul';
      return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>)}</List>;
    })}
  </div>;
}
