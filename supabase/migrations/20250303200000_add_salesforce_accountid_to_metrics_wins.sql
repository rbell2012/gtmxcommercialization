alter table public.metrics_wins add column if not exists salesforce_accountid text not null default '';
