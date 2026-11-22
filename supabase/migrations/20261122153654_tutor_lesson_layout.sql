begin;

create table tutor_private.lesson_room_layouts (
  lesson_id uuid primary key references public.tutor_lessons(id) on delete cascade,
  student_visible boolean not null,
  revision integer not null default 1
);
alter table tutor_private.lesson_room_layouts enable row level security;
revoke all on tutor_private.lesson_room_layouts from public, anon, authenticated;

create function tutor_private.lesson_room_layout_api(p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  lid uuid := (p->>'lesson_id')::uuid;
  drafts jsonb := '{}';
  layout tutor_private.lesson_room_layouts%rowtype;
begin
  if p_action = 'lesson_room_read' then
    drafts := tutor_private.lesson_room_api(p_action, p);
    select * into layout from tutor_private.lesson_room_layouts where lesson_id = lid;
  elsif p_action = 'lesson_room_layout' then
    if not tutor_private.code_session_active() or not tutor_private.is_teacher()
      or not exists (
        select from public.tutor_lessons l join public.tutor_student_links s using (teacher_id, student_id)
        where l.id = lid and l.teacher_id = auth.uid() and l.status <> 'canceled' and s.status = 'active'
      ) then
      raise exception 'Урок недоступен' using errcode = '42501';
    end if;
    if jsonb_typeof(p->'student_visible') is distinct from 'boolean' then
      raise exception 'Неверный формат настройки урока' using errcode = '22023';
    end if;
    insert into tutor_private.lesson_room_layouts as current_layout (lesson_id, student_visible)
      values (lid, (p->>'student_visible')::boolean)
      on conflict (lesson_id) do update set student_visible = excluded.student_visible,
        revision = current_layout.revision + 1
      returning * into layout;
  else
    raise exception 'Неизвестное действие' using errcode = '22023';
  end if;
  return drafts || jsonb_build_object('layout', jsonb_build_object(
    'student_visible', coalesce(layout.student_visible, true), 'revision', coalesce(layout.revision, 0)
  ));
end $$;

revoke all on function tutor_private.lesson_room_layout_api(text,jsonb) from public, anon;
grant execute on function tutor_private.lesson_room_layout_api(text,jsonb) to authenticated;

create or replace function public.tutor_api(p_action text, p jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$
  select case
    when p_action in ('lesson_room_read','lesson_room_layout') then tutor_private.lesson_room_layout_api(p_action,p)
    when p_action = 'lesson_room_save' then tutor_private.lesson_room_api(p_action,p)
    else tutor_private.lesson_calendar_api(p_action,p) end
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('tutor-lesson-board', 'tutor-lesson-board', false, 6291456, array['image/png','image/jpeg','image/webp']);

create function tutor_private.lesson_board_file_access(p_name text, p_write boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select tutor_private.code_session_active()
    and p_name ~ '^[0-9a-f-]{36}/(teacher|student)/[0-9a-f-]{36}\.(png|jpg|webp)$'
    and exists (
      select from public.tutor_lessons l join public.tutor_student_links s using (teacher_id, student_id)
      where l.id = case when split_part(p_name, '/', 1)
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(p_name, '/', 1)::uuid end
        and l.status <> 'canceled' and s.status = 'active'
        and ((l.teacher_id = auth.uid() and tutor_private.is_teacher())
          or (l.student_id = auth.uid() and (not p_write or split_part(p_name, '/', 2) = 'student')))
    )
$$;
revoke all on function tutor_private.lesson_board_file_access(text,boolean) from public, anon;
grant execute on function tutor_private.lesson_board_file_access(text,boolean) to authenticated;

create policy tutor_board_image_read on storage.objects for select to authenticated
  using (bucket_id = 'tutor-lesson-board' and tutor_private.lesson_board_file_access(name, false));
create policy tutor_board_image_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'tutor-lesson-board' and tutor_private.lesson_board_file_access(name, true));

commit;
