export type MarkdownBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'unordered-list'; items: string[] };

export function normalizeAiMarkdown(value: unknown): string;
export function parseMarkdownBlocks(value: unknown): MarkdownBlock[];
