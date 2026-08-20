import { Fragment, type ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { parseMarkdownBlocks } from '../lib/markdown.mjs';
import { ExternalLinkIcon, GlobeIcon } from './icons';

interface MarkdownContentProps {
  content: string;
  sources?: CitationSource[];
}

export interface CitationSource {
  id: string;
  type: 'official_news' | 'requested_web';
  title: string;
  url: string;
  domain: string;
  favicon: string;
  publishedDate: string;
}

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\[(?:N|W)\d+\]|\*[^*\n]+\*|_[^_\n]+_)/g;
const SOURCE_LINE = /^\[((?:N|W)\d+)\](?:\s+https?:\/\/\S+)?$/;

function SourceFavicon({ source, size = 16 }: { source: CitationSource; size?: number }) {
  const [imgError, setImgError] = useState(false);

  return (
    <span
      class="citation-favicon"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      {source.favicon && !imgError ? (
        <img
          src={source.favicon}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <GlobeIcon size={Math.round(size * 0.75)} class="citation-favicon-fallback" />
      )}
    </span>
  );
}

function InlineCitation({
  source,
  fallback,
  keyValue,
}: {
  source?: CitationSource;
  fallback: string;
  keyValue: string;
}) {
  const displayLabel = source?.domain || source?.title || fallback;
  if (!source?.url) {
    return (
      <span key={keyValue} class="citation-chip is-unlinked">
        <GlobeIcon size={12} class="citation-favicon-fallback" />
        <span>{displayLabel}</span>
      </span>
    );
  }
  return (
    <a
      key={keyValue}
      class="citation-chip"
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      title={`${source.title} — ${source.domain}`}
      aria-label={`${displayLabel}: ${source.title}, ${source.domain}`}
    >
      <SourceFavicon source={source} size={14} />
      <span>{displayLabel}</span>
    </a>
  );
}

function SourceCard({ source, keyValue }: { source: CitationSource; keyValue: string }) {
  const content = (
    <>
      <SourceFavicon source={source} size={28} />
      <span class="citation-source-copy">
        <strong>{source.title}</strong>
        <small>
          <span class="citation-domain-badge">{source.domain}</span>
          {source.publishedDate && <time>{source.publishedDate.slice(0, 10)}</time>}
        </small>
      </span>
      <ExternalLinkIcon size={14} class="citation-source-icon" />
    </>
  );
  if (!source.url) {
    return (
      <span key={keyValue} class="citation-source-card is-unlinked">
        {content}
      </span>
    );
  }
  return (
    <a
      key={keyValue}
      class="citation-source-card"
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`Открыть источник: ${source.title}`}
    >
      {content}
    </a>
  );
}

function renderInline(text: string, keyPrefix: string, sourcesById: Map<string, CitationSource>, sourcesByUrl: Map<string, CitationSource>): ComponentChildren[] {
  const parts = text.split(INLINE_TOKEN).filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key}>{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) {
      const source = sourcesByUrl.get(link[2]);
      if (source) return <a key={key} class="citation-text-link" href={source.url} target="_blank" rel="noreferrer noopener" title={source.domain}><SourceFavicon source={source} /><span>{link[1]}</span></a>;
      return <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>;
    }
    const citation = /^\[((?:N|W)\d+)\]$/.exec(part);
    if (citation) return <InlineCitation key={key} keyValue={key} source={sourcesById.get(citation[1])} fallback={citation[1]} />;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function MarkdownContent({ content, sources = [] }: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(content);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourcesByUrl = new Map(sources.filter((source) => source.url).map((source) => [source.url, source]));
  const inline = (text: string, key: string) => renderInline(text, key, sourcesById, sourcesByUrl);

  return <div class="markdown-content">
    {blocks.map((block, index) => {
      const key = `block-${index}`;
      if (block.type === 'heading') {
        if (block.level === 1) return <h3 key={key}>{inline(block.text, key)}</h3>;
        if (block.level === 2) return <h4 key={key}>{inline(block.text, key)}</h4>;
        return <h5 key={key}>{inline(block.text, key)}</h5>;
      }
      if (block.type === 'quote') return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
      if (block.type === 'paragraph') return <p key={key}>{inline(block.text, key)}</p>;

      const List = block.type === 'ordered-list' ? 'ol' : 'ul';
      return <List key={key}>{block.items.map((item, itemIndex) => {
        const itemKey = `${key}-${itemIndex}`;
        const sourceId = SOURCE_LINE.exec(item)?.[1];
        const source = sourceId ? sourcesById.get(sourceId) : undefined;
        return <li key={itemKey} class={source ? 'citation-source-item' : ''}>{source
          ? <SourceCard source={source} keyValue={`${itemKey}-source`} />
          : inline(item, itemKey)}</li>;
      })}</List>;
    })}
  </div>;
}
