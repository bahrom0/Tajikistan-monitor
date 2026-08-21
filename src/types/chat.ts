import type { CitationSource } from '../components/MarkdownContent';

export type { CitationSource };

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatModes {
  webSearch: boolean;
  dbSearch: boolean;
  officialStrict: boolean;
}

export type AgentStepStage = 'search' | 'reading' | 'thinking' | 'refining' | 'done' | 'error';

export interface AgentStep {
  id: string;
  stage: AgentStepStage;
  label: string;
  query?: string;
  count?: number;
  readingTitle?: string;
  domain?: string;
  thought?: string;
  timestamp?: number;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  state: 'running' | 'done' | 'error';
  label?: string;
  resultSummary?: string;
}

export type ChatTimelineItem =
  | { type: 'assistant'; id: string; content: string }
  | { type: 'tool'; id: string; toolCall: ToolCallRecord }
  | { type: 'activity'; id: string; step: AgentStep };

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  thinking_content?: string;
  is_thinking?: boolean;
  sources: CitationSource[];
  tool_calls?: ToolCallRecord[];
  agent_steps?: AgentStep[];
  error_state?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id?: string | null;
  session_id: string;
  title: string;
  pinned: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type DateGroupId = 'today' | 'yesterday' | 'week' | 'older';

export interface DateGroup {
  id: DateGroupId;
  labelRu: string;
  labelTg: string;
  conversations: Conversation[];
}

export type ChatStreamEvent =
  | { type: 'token'; value: string }
  | { type: 'think_token'; value: string }
  | { type: 'agent_step'; step: AgentStep }
  | { type: 'activity'; step: AgentStep }
  | { type: 'sources'; items: CitationSource[] }
  | { type: 'tool_start'; id: string; name: string; label: string; args?: Record<string, unknown> }
  | { type: 'tool_done'; id: string; name: string; state?: 'done' | 'error'; resultSummary?: string }
  | { type: 'title_generated'; conversationId: string; title: string; icon?: string }
  | { type: 'message_saved'; messageId: string; conversationId: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
