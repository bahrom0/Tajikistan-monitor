-- AI Chat Persistence: conversations and messages tables, indexes, and RLS policies

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text not null check (length(session_id) between 1 and 128),
  title text not null default 'Новый разговор' check (length(title) between 1 and 300),
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

create index if not exists chat_conversations_session_updated_idx
  on public.chat_conversations (session_id, updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  error_state text check (error_state is null or length(error_state) <= 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_messages_conv_created_idx
  on public.chat_messages (conversation_id, created_at asc);

-- Enable RLS
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

-- Revoke default public access
revoke all on table public.chat_conversations, public.chat_messages from anon, authenticated;

-- Grants for Data API
grant select, insert, update, delete on table public.chat_conversations to anon, authenticated, service_role;
grant select, insert, update, delete on table public.chat_messages to anon, authenticated, service_role;

-- RLS Policies
-- 1. For authenticated users: matching user_id or matching session_id
-- 2. For anon users: matching session_id
create policy "Users can manage their own conversations"
  on public.chat_conversations
  for all
  to anon, authenticated
  using (
    (auth.uid() is not null and user_id = auth.uid())
    or (session_id = coalesce(current_setting('request.headers', true)::json->>'x-session-id', session_id))
  )
  with check (
    (auth.uid() is not null and (user_id is null or user_id = auth.uid()))
    or (session_id = coalesce(current_setting('request.headers', true)::json->>'x-session-id', session_id))
  );

create policy "Users can manage messages in their conversations"
  on public.chat_messages
  for all
  to anon, authenticated
  using (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
      and (
        (auth.uid() is not null and c.user_id = auth.uid())
        or (c.session_id = coalesce(current_setting('request.headers', true)::json->>'x-session-id', c.session_id))
      )
    )
  )
  with check (
    exists (
      select 1 from public.chat_conversations c
      where c.id = chat_messages.conversation_id
      and (
        (auth.uid() is not null and (c.user_id is null or c.user_id = auth.uid()))
        or (c.session_id = coalesce(current_setting('request.headers', true)::json->>'x-session-id', c.session_id))
      )
    )
  );

-- Service role full access
create policy "Service role full access on conversations"
  on public.chat_conversations for all to service_role using (true) with check (true);

create policy "Service role full access on messages"
  on public.chat_messages for all to service_role using (true) with check (true);
