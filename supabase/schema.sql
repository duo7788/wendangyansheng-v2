-- 在 Supabase Dashboard → SQL Editor 中整段执行一次。
-- 这个表保存「一份原始文档 + 一个角色」对应的最新 AI 衍生视图。
create table if not exists public.document_derivations (
  id uuid primary key default gen_random_uuid(),
  source_document_id text not null,
  source_document_title text not null,
  role_id text not null,
  role_name text not null,
  related_document_ids jsonb not null default '[]'::jsonb,
  content text not null,
  model text not null,
  source_content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, role_id)
);

-- 原文变更后，作者确认要准备的衍生更新。当前只记录确认，不自动
-- 覆盖衍生内容，也不会通知角色；后续可在此记录中补入句子级影响范围。
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

-- 一份原文（及其关联资料）只需被 AI 结构化理解一次。后续多个角色
-- 复用同一份底稿，避免重复阅读全文。source_content_hash 用于区分编辑后的版本。
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

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists document_derivations_set_updated_at on public.document_derivations;
create trigger document_derivations_set_updated_at
before update on public.document_derivations
for each row execute function public.set_updated_at();

drop trigger if exists document_understandings_set_updated_at on public.document_understandings;
create trigger document_understandings_set_updated_at
before update on public.document_understandings
for each row execute function public.set_updated_at();

drop trigger if exists document_derivation_updates_set_updated_at on public.document_derivation_updates;
create trigger document_derivation_updates_set_updated_at
before update on public.document_derivation_updates
for each row execute function public.set_updated_at();

-- 浏览器不会直接访问此表；Vercel 的服务端使用 service_role 保存数据。
alter table public.document_derivations enable row level security;
alter table public.document_understandings enable row level security;
alter table public.document_derivation_updates enable row level security;

-- New Supabase Secret keys are mapped to service_role for server-side calls.
-- It bypasses RLS, but still needs table-level privileges.
grant select, insert, update on table public.document_derivations to service_role;
grant select, insert, update on table public.document_understandings to service_role;
grant select, insert, update on table public.document_derivation_updates to service_role;
