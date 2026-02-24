-- App writes: findings table for webview notes/findings
create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.findings enable row level security;

-- Allow anonymous read/write for now; tighten with auth when you add login
create policy "Allow read findings"
  on public.findings for select
  using (true);

create policy "Allow insert findings"
  on public.findings for insert
  with check (true);

create policy "Allow update findings"
  on public.findings for update
  using (true);

create policy "Allow delete findings"
  on public.findings for delete
  using (true);

comment on table public.findings is 'Findings/notes written from the webapp; read path for data is Hex embed.';
