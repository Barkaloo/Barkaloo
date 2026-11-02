-- Run once in the existing project's Supabase SQL Editor if app_state is absent.
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.app_state enable row level security;
revoke all on public.app_state from anon, public;
grant select, insert, update on public.app_state to authenticated;

drop policy if exists barkaloo_account_boundary on public.app_state;
create policy barkaloo_account_boundary on public.app_state
  as restrictive for all to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists barkaloo_own_state on public.app_state;
create policy barkaloo_own_state on public.app_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.barkaloo_state_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  else
    NEW.updated_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
drop trigger if exists barkaloo_state_timestamp on public.app_state;
create trigger barkaloo_state_timestamp before insert or update on public.app_state
for each row execute function public.barkaloo_state_timestamp();
