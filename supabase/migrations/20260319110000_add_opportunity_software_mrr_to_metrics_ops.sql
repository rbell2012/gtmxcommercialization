-- Software MRR on opportunity (metrics_ops)

alter table public.metrics_ops add column if not exists opportunity_software_mrr numeric;

comment on column public.metrics_ops.opportunity_software_mrr is 'Opportunity software MRR amount';
