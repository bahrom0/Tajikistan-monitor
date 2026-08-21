import { useState } from 'preact/hooks';
import { CheckIcon, CopyIcon } from '../icons';

interface ChatCodeBlockProps {
  code: string;
  language?: string;
}

export function ChatCodeBlock({ code, language = 'text' }: ChatCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback copy
    }
  };

  return (
    <div class="chat-code-block">
      <div class="chat-code-header">
        <span class="chat-code-lang">{language || 'text'}</span>
        <button
          type="button"
          class="chat-code-copy-btn"
          onClick={handleCopy}
          aria-label="Копировать код"
          title="Копировать в буфер обмена"
        >
          {copied ? (
            <>
              <CheckIcon size={13} strokeWidth={2.5} class="text-success" />
              <span>Скопировано</span>
            </>
          ) : (
            <>
              <CopyIcon size={13} strokeWidth={1.75} />
              <span>Копировать</span>
            </>
          )}
        </button>
      </div>
      <pre class="chat-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
