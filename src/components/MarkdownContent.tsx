import { Fragment, type ComponentChildren } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { parseMarkdownBlocks } from '../lib/markdown.mjs';
import { ExternalLinkIcon, GlobeIcon } from './icons';
import { ChatCodeBlock } from './chat/ChatCodeBlock';

interface MarkdownContentProps {
  content: string;
  sources?: CitationSource[];
  isStreaming?: boolean;
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

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\[(?:N|W)\d+\]|\*[^*\n]+\*|_[^_\n]+_)/g;
const SOURCE_LINE = /^\[((?:N|W)\d+)\](?:\s+https?:\/\/\S+)?$/;

function useSmoothStream(targetText: string, isStreaming: boolean): string {
  const [displayedText, setDisplayedText] = useState(targetText);
  const targetRef = useRef(targetText);
  targetRef.current = targetText;
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(targetText);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const step = () => {
      setDisplayedText((curr) => {
        const target = targetRef.current;
        if (!isStreamingRef.current || curr.length >= target.length) {
          return target;
        }

        const remaining = target.slice(curr.length);
        const gap = remaining.length;

        let stepCount = 1;
        if (gap > 120) {
          stepCount = Math.min(gap, Math.ceil(gap * 0.35));
        } else if (gap > 40) {
          const match = remaining.match(/^(\S+\s*|\s+)/);
          stepCount = match ? match[0].length : Math.min(gap, 6);
        } else {
          const match = remaining.match(/^(\S{1,4}|\s+)/);
          stepCount = match ? match[0].length : Math.min(gap, 2);
        }

        return curr + remaining.slice(0, stepCount);
      });

      if (isStreamingRef.current) {
        frameRef.current = requestAnimationFrame(step);
      }
    };

    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(step);
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [isStreaming, targetText]);

  return isStreaming ? displayedText : targetText;
}

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

function renderInline(
  text: string,
  keyPrefix: string,
  sourcesById: Map<string, CitationSource>,
  sourcesByUrl: Map<string, CitationSource>
): ComponentChildren[] {
  const parts = text.split(INLINE_TOKEN).filter(Boolean);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <del key={key} class="chat-strikethrough">{part.slice(2, -2)}</del>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={key} class="chat-inline-code">{part.slice(1, -1)}</code>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) {
      const source = sourcesByUrl.get(link[2]);
      if (source) {
        return (
          <a key={key} class="citation-text-link" href={source.url} target="_blank" rel="noreferrer noopener" title={source.domain}>
            <SourceFavicon source={source} />
            <span>{link[1]}</span>
          </a>
        );
      }
      return (
        <a key={key} class="chat-markdown-link" href={link[2]} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>
      );
    }
    const citation = /^\[((?:N|W)\d+)\]$/.exec(part);
    if (citation) return <InlineCitation key={key} keyValue={key} source={sourcesById.get(citation[1])} fallback={citation[1]} />;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export function MarkdownContent({ content, sources = [], isStreaming = false }: MarkdownContentProps) {
  const smoothText = useSmoothStream(content, isStreaming);
  const blocks = parseMarkdownBlocks(smoothText);
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourcesByUrl = new Map(sources.filter((source) => source.url).map((source) => [source.url, source]));
  const inline = (text: string, key: string) => renderInline(text, key, sourcesById, sourcesByUrl);
  const totalBlocks = blocks.length;

  return (
    <div class={`markdown-content${isStreaming ? ' is-streaming' : ''}`}>
      {blocks.map((block, index) => {
        const isLastBlock = index === totalBlocks - 1;
        const key = `block-${index}`;

        const cursor = isStreaming && isLastBlock ? (
          <span class="gemini-stream-cursor" aria-hidden="true" />
        ) : null;

        if (block.type === 'divider') {
          return (
            <Fragment key={key}>
              <hr class="chat-markdown-divider" />
              {cursor}
            </Fragment>
          );
        }

        if (block.type === 'code') {
          return (
            <Fragment key={key}>
              <ChatCodeBlock code={block.code} language={block.language} />
              {cursor}
            </Fragment>
          );
        }

        if (block.type === 'table') {
          return (
            <Fragment key={key}>
              <div class="chat-table-wrapper">
                <table class="chat-table">
                  <thead>
                    <tr>
                      {block.headers.map((h, hi) => {
                        const align = block.alignments?.[hi] || 'left';
                        return (
                          <th key={`th-${hi}`} style={{ textAlign: align }}>
                            {inline(h, `${key}-th-${hi}`)}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={`tr-${ri}`}>
                        {row.map((cell, ci) => {
                          const align = block.alignments?.[ci] || 'left';
                          return (
                            <td key={`td-${ci}`} style={{ textAlign: align }}>
                              {inline(cell, `${key}-td-${ri}-${ci}`)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cursor}
            </Fragment>
          );
        }

        if (block.type === 'task-list') {
          return (
            <ul key={key} class="chat-task-list">
              {block.items.map((item, itemIndex) => {
                const isLastItem = isLastBlock && itemIndex === block.items.length - 1;
                const itemKey = `${key}-task-${itemIndex}`;
                return (
                  <li key={itemKey} class={`chat-task-item${item.checked ? ' is-checked' : ''}`}>
                    <input type="checkbox" checked={item.checked} readOnly class="chat-task-checkbox" />
                    <span class="chat-task-text">
                      {inline(item.text, itemKey)}
                      {isLastItem ? cursor : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : block.level === 3 ? 'h4' : block.level === 4 ? 'h5' : 'h6';
          const headingClass = `chat-heading-h${Math.min(block.level, 5)}`;
          return (
            <Tag key={key} class={headingClass}>
              {inline(block.text, key)}
              {cursor}
            </Tag>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key}>
              {inline(block.text, key)}
              {cursor}
            </blockquote>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={key} class={isStreaming && isLastBlock ? 'gemini-streaming-tail' : ''}>
              {inline(block.text, key)}
              {cursor}
            </p>
          );
        }

        const List = block.type === 'ordered-list' ? 'ol' : 'ul';
        return (
          <List key={key}>
            {block.items.map((item, itemIndex) => {
              const isLastItem = isLastBlock && itemIndex === block.items.length - 1;
              const itemKey = `${key}-${itemIndex}`;
              const sourceId = SOURCE_LINE.exec(item)?.[1];
              const source = sourceId ? sourcesById.get(sourceId) : undefined;
              return (
                <li key={itemKey} class={source ? 'citation-source-item' : ''}>
                  {source ? (
                    <SourceCard source={source} keyValue={`${itemKey}-source`} />
                  ) : (
                    <>
                      {inline(item, itemKey)}
                      {isLastItem ? cursor : null}
                    </>
                  )}
                </li>
              );
            })}
          </List>
        );
      })}
    </div>
  );
}
