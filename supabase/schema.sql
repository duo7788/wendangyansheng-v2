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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, role_id)
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

-- 浏览器不会直接访问此表；Vercel 的服务端使用 service_role 保存数据。
alter table public.document_derivations enable row level security;

-- New Supabase Secret keys are mapped to service_role for server-side calls.
-- It bypasses RLS, but still needs table-level privileges.
grant select, insert, update on table public.document_derivations to service_role;
