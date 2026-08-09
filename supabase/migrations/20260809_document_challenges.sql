-- Run this migration in Supabase SQL Editor for an already deployed project.
create table if not exists public.document_challenge_runs (
  id uuid primary key default gen_random_uuid(),
  source_document_id text not null,
  source_document_title text not null,
  participant_roles jsonb not null,
  challenges jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.document_challenge_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_run_id uuid not null references public.document_challenge_runs(id) on delete cascade,
  source_document_id text not null,
  challenge_index integer not null check (challenge_index >= 0),
  role_id text not null,
  role_name text not null,
  content text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_run_id, challenge_index)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists document_challenge_tasks_set_updated_at on public.document_challenge_tasks;
create trigger document_challenge_tasks_set_updated_at
before update on public.document_challenge_tasks
for each row execute function public.set_updated_at();

alter table public.document_challenge_runs enable row level security;
alter table public.document_challenge_tasks enable row level security;

grant select, insert, update on table public.document_challenge_runs to service_role;
grant select, insert, update on table public.document_challenge_tasks to service_role;
