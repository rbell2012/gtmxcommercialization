-- Enable realtime for core tables so concurrent users stay in sync.
alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.weekly_funnels;
alter publication supabase_realtime add table public.win_entries;
