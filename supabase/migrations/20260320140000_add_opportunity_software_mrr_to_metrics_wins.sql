-- Software MRR on opportunity (metrics_wins)

alter table public.metrics_wins add column if not exists opportunity_software_mrr numeric;

comment on column public.metrics_wins.opportunity_software_mrr is 'Opportunity software MRR amount';
