-- 为既有项目保存角色衍生中的 AI 项目速览（思维导图结构）。
alter table public.document_derivations
  add column if not exists visual_overview jsonb;
