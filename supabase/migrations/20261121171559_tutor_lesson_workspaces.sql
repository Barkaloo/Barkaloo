begin;

alter table tutor_private.lesson_room_drafts
  add column mode text not null default 'board' check (mode in ('board', 'code')),
  add column board jsonb not null default '[]'
    check (jsonb_typeof(board) = 'array' and octet_length(board::text) <= 524288);

create or replace function tutor_private.lesson_room_api(p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  lid uuid := (p->>'lesson_id')::uuid;
  lesson public.tutor_lessons%rowtype;
  is_lesson_teacher boolean;
  area text;
  editor uuid;
  board_data jsonb := p->'board';
  area_mode text := p->>'mode';
  expected_revision integer;
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
    is_lesson_teacher := lesson.teacher_id = uid and tutor_private.is_teacher();
    area := coalesce(p->>'area', case when is_lesson_teacher then 'teacher' else 'student' end);
    if area not in ('teacher', 'student') or (area = 'teacher' and not is_lesson_teacher) then
      raise exception 'Эта рабочая область доступна только для просмотра' using errcode = '42501';
    end if;
    editor := case when area = 'teacher' then lesson.teacher_id else lesson.student_id end;
    expected_revision := (p->>'revision')::integer;
    if char_length(p->>'code') > 30000 or char_length(p->>'notes') > 12000
      or coalesce(expected_revision, -1) < 0
      or (area_mode is not null and area_mode not in ('board', 'code'))
      or (board_data is not null and (jsonb_typeof(board_data) <> 'array'
        or octet_length(board_data::text) > 524288)) then
      raise exception 'Неверный формат рабочей области' using errcode = '22023';
    end if;

    if expected_revision = 0 then
      insert into tutor_private.lesson_room_drafts (lesson_id, author_id, code, notes, mode, board)
        values (lid, editor, coalesce(p->>'code', ''), coalesce(p->>'notes', ''),
          coalesce(area_mode, 'board'), coalesce(board_data, '[]'))
        on conflict do nothing returning revision into next_revision;
    else
      update tutor_private.lesson_room_drafts d
        set code = coalesce(p->>'code', d.code), notes = coalesce(p->>'notes', d.notes),
          mode = coalesce(area_mode, d.mode), board = coalesce(board_data, d.board),
          revision = d.revision + 1
        where d.lesson_id = lid and d.author_id = editor and d.revision = expected_revision
        returning revision into next_revision;
    end if;
    if next_revision is null then
      raise exception 'Область уже изменили в другой вкладке или кабинете.' using errcode = '40001';
    end if;
    return jsonb_build_object('revision', next_revision);
  end if;

  return coalesce((
    select jsonb_object_agg(
      case when d.author_id = lesson.teacher_id then 'teacher' else 'student' end,
      jsonb_build_object('code', d.code, 'notes', d.notes, 'revision', d.revision,
        'mode', d.mode, 'board', d.board)
    ) from tutor_private.lesson_room_drafts d where d.lesson_id = lid
      and d.author_id in (lesson.teacher_id, lesson.student_id)
  ), '{}'::jsonb);
end $$;

commit;
