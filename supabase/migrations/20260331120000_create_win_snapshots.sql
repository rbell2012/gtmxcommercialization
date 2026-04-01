create table if not exists public.win_snapshots (
  id text primary key,
  account_name text,
  salesforce_accountid text,
  win_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.win_snapshots (id, account_name, salesforce_accountid, win_date)
select w.id, w.account_name, w.salesforce_accountid, w.win_date
from public.metrics_wins w
where w.id is not null
on conflict (id) do update
set
  account_name = excluded.account_name,
  salesforce_accountid = excluded.salesforce_accountid,
  win_date = excluded.win_date,
  updated_at = now();

alter table public.win_snapshots enable row level security;

drop policy if exists "Allow all on win_snapshots" on public.win_snapshots;
create policy "Allow all on win_snapshots"
on public.win_snapshots
for all
using (true)
with check (true);

alter publication supabase_realtime add table public.win_snapshots;
