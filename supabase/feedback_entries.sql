create extension if not exists pgcrypto;

create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  page_path text not null,
  context_type text,
  context_id text,
  app_version text,
  user_agent text
);

create index if not exists feedback_entries_created_at_idx
  on public.feedback_entries (created_at desc);

create index if not exists feedback_entries_page_path_idx
  on public.feedback_entries (page_path);

create index if not exists feedback_entries_context_idx
  on public.feedback_entries (context_type, context_id);
