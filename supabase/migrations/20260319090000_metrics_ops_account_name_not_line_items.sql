-- If account_name_line_items was added by mistake, migrate to account_name and drop it

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'metrics_ops'
      and column_name = 'account_name_line_items'
  ) then
    alter table public.metrics_ops add column if not exists account_name text;
    update public.metrics_ops
    set account_name = account_name_line_items
    where account_name is null
      and account_name_line_items is not null;
    alter table public.metrics_ops drop column account_name_line_items;
  end if;
end $$;
