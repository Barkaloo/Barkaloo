begin;

create table tutor_private.lesson_blocked_days (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  time_zone text not null,
  primary key (teacher_id, day)
);

alter table tutor_private.lesson_blocked_days enable row level security;
revoke all on tutor_private.lesson_blocked_days from public, anon, authenticated;
grant select, insert, update, delete on tutor_private.lesson_blocked_days to authenticated;

create policy lesson_blocked_days_owner on tutor_private.lesson_blocked_days
  for all to authenticated
  using (teacher_id = (select auth.uid()) and (select tutor_private.is_teacher()))
  with check (teacher_id = (select auth.uid()) and (select tutor_private.is_teacher()));

create function tutor_private.guard_lesson_day() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'canceled' then
    return new;
  end if;
  -- Serialize closing a date and booking against the same teacher's calendar.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.teacher_id::text, 172044));
  if tg_op = 'UPDATE' then
    if old.status <> 'canceled' and old.starts_at = new.starts_at
        and old.teacher_id = new.teacher_id then
      return new;
    end if;
  elsif exists (
    -- lesson_save uses INSERT ON CONFLICT for edits.
    select 1 from public.tutor_lessons as existing
    where existing.id = new.id and existing.teacher_id = new.teacher_id
      and existing.starts_at = new.starts_at and existing.status <> 'canceled'
  ) then
    return new;
  end if;
  if exists (
    select 1 from tutor_private.lesson_blocked_days as blocked
    where blocked.teacher_id = new.teacher_id
      and blocked.day between (new.starts_at at time zone 'UTC')::date - 1
        and (new.starts_at at time zone 'UTC')::date + 1
      and blocked.day = (new.starts_at at time zone blocked.time_zone)::date
  ) then
    raise exception 'Дата закрыта для новых занятий. Выберите другой день.' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function tutor_private.guard_lesson_day() from public, anon, authenticated;
create trigger tutor_guard_lesson_day
  before insert or update of starts_at, status, teacher_id on public.tutor_lessons
  for each row execute function tutor_private.guard_lesson_day();

create function tutor_private.lesson_calendar_api(p_action text, p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  blocked_day date;
  zone text;
  result jsonb;
begin
  if p_action = 'lesson_block_day' then
    if uid is null or not tutor_private.is_teacher() then
      raise exception 'Требуется роль преподавателя' using errcode = '42501';
    end if;
    if coalesce(p->>'day', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or jsonb_typeof(p->'blocked') is distinct from 'boolean' then
      raise exception 'Укажите дату и её новый статус' using errcode = '22023';
    end if;
    blocked_day := (p->>'day')::date;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 172044));
    if (p->>'blocked')::boolean then
      zone := p->>'time_zone';
      if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
        raise exception 'Не удалось определить часовой пояс' using errcode = '22023';
      end if;
      insert into tutor_private.lesson_blocked_days (teacher_id, day, time_zone)
      values (uid, blocked_day, zone)
      on conflict (teacher_id, day) do nothing;
    else
      delete from tutor_private.lesson_blocked_days
      where teacher_id = uid and day = blocked_day;
    end if;
    return '{}'::jsonb;
  end if;

  result := tutor_private.bank_api(p_action, p);
  if p_action = 'data' and tutor_private.is_teacher() then
    return result || jsonb_build_object('blocked_lesson_days', coalesce((
      select jsonb_agg(day order by day)
      from tutor_private.lesson_blocked_days where teacher_id = uid
    ), '[]'::jsonb));
  end if;
  return result;
end $$;

revoke all on function tutor_private.lesson_calendar_api(text, jsonb) from public, anon;
grant execute on function tutor_private.lesson_calendar_api(text, jsonb) to authenticated;
create or replace function public.tutor_api(p_action text, p jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select tutor_private.lesson_calendar_api(p_action, p)
$$;

commit;
