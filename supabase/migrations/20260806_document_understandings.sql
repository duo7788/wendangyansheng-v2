-- 只为已存在的项目增加 AI 理解底稿缓存表。
-- 这份迁移不会修改 document_derivations，因此可避开旧表的并发锁。

create table if not exists public.document_understandings (
  id uuid primary key default gen_random_uuid(),
  source_document_id text not null,
  source_content_hash text not null,
  related_content_hash text not null default '',
  source_blocks jsonb not null,
  facts jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, source_content_hash, related_content_hash)
);

-- The existing schema already provides this shared trigger function.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'document_understandings_set_updated_at'
      and tgrelid = 'public.document_understandings'::regclass
  ) then
    create trigger document_understandings_set_updated_at
    before update on public.document_understandings
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.document_understandings enable row level security;
grant select, insert, update on table public.document_understandings to service_role;
