-- Rename pilot "Toast Growth Platform" to "Guest Pro" in stored data.
update public.teams
set name = 'Guest Pro', updated_at = now()
where name = 'Toast Growth Platform';
