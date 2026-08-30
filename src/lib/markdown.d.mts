export type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'task-list'; items: { checked: boolean; text: string }[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'divider' }
  | { type: 'table'; headers: string[]; alignments?: ('left' | 'center' | 'right')[]; rows: string[][] };

export function normalizeAiMarkdown(value: unknown): string;
export function parseMarkdownBlocks(value: unknown): MarkdownBlock[];
