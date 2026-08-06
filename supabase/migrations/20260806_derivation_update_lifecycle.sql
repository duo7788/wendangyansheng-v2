-- 为既有项目增加“原文修改后，作者确认准备更新”的生命周期底座。
-- 这不会改写现有衍生文档，也不会向任何角色发送通知。

alter table public.document_derivations
  add column if not exists source_content_hash text;

create table if not exists public.document_derivation_updates (
  id uuid primary key default gen_random_uuid(),
  source_document_id text not null,
  role_id text not null,
  base_source_content_hash text,
  target_source_content_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'draft_ready', 'author_approved', 'published', 'viewed', 'dismissed')),
  affected_source_block_ids jsonb not null default '[]'::jsonb,
  affected_derivation_item_ids jsonb not null default '[]'::jsonb,
  update_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, role_id, target_source_content_hash)
);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'document_derivation_updates_set_updated_at'
      and tgrelid = 'public.document_derivation_updates'::regclass
  ) then
    create trigger document_derivation_updates_set_updated_at
    before update on public.document_derivation_updates
    for each row execute function public.set_updated_at();
  end if;
end;
$$;

alter table public.document_derivation_updates enable row level security;
grant select, insert, update on table public.document_derivation_updates to service_role;
