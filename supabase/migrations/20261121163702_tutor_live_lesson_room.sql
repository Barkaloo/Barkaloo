begin;

create table tutor_private.lesson_room_drafts (
  lesson_id uuid not null references public.tutor_lessons(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  code text not null check (char_length(code) <= 30000),
  notes text not null check (char_length(notes) <= 12000),
  revision integer not null default 1,
  primary key (lesson_id, author_id)
);

alter table tutor_private.lesson_room_drafts enable row level security;
revoke all on tutor_private.lesson_room_drafts from public, anon, authenticated;

create function tutor_private.lesson_room_api(p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lid uuid := (p->>'lesson_id')::uuid;
  lesson public.tutor_lessons%rowtype;
  next_revision integer;
begin
  if uid is null or not tutor_private.code_session_active() then
    raise exception 'Урок недоступен' using errcode = '42501';
  end if;
  select l.* into lesson from public.tutor_lessons l
    join public.tutor_student_links link using (teacher_id, student_id)
    where l.id = lid and l.status <> 'canceled' and link.status = 'active'
      and ((l.teacher_id = uid and tutor_private.is_teacher()) or l.student_id = uid);
  if not found then
    raise exception 'Урок недоступен' using errcode = '42501';
  end if;
  if p_action = 'lesson_room_save' then
    if char_length(coalesce(p->>'code','')) > 30000 or char_length(coalesce(p->>'notes','')) > 12000
      or coalesce((p->>'revision')::integer, -1) < 0 then
      raise exception 'Неверный формат рабочего черновика' using errcode = '22023';
    end if;

    if (p->>'revision')::integer = 0 then
      insert into tutor_private.lesson_room_drafts (lesson_id, author_id, code, notes)
        values (lid, uid, coalesce(p->>'code',''), coalesce(p->>'notes',''))
        on conflict do nothing returning revision into next_revision;
    else
      update tutor_private.lesson_room_drafts
        set code = coalesce(p->>'code',''), notes = coalesce(p->>'notes',''), revision = revision + 1
        where lesson_id = lid and author_id = uid and revision = (p->>'revision')::integer
        returning revision into next_revision;
    end if;
    if next_revision is null then
      raise exception 'Черновик изменился в другой вкладке. Скопируйте свои изменения и обновите страницу.' using errcode = '40001';
    end if;
    return jsonb_build_object('revision', next_revision);
  end if;
  return coalesce((
    select jsonb_object_agg(
      case when d.author_id = lesson.teacher_id then 'teacher' else 'student' end,
      jsonb_build_object('code', d.code, 'notes', d.notes, 'revision', d.revision)
    ) from tutor_private.lesson_room_drafts d where d.lesson_id = lid
      and d.author_id in (lesson.teacher_id, lesson.student_id)
  ), '{}'::jsonb);
end $$;

revoke all on function tutor_private.lesson_room_api(text,jsonb) from public, anon;
grant execute on function tutor_private.lesson_room_api(text,jsonb) to authenticated;

create or replace function public.tutor_api(p_action text, p jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select case when p_action in ('lesson_room_read','lesson_room_save')
    then tutor_private.lesson_room_api(p_action,p)
    else tutor_private.lesson_calendar_api(p_action,p) end
$$;

commit;
