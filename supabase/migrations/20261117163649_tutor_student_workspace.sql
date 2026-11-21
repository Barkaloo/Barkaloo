-- One shared schedule and homework source for both roles. No auth or non-Tutor changes.
begin;
alter table public.tutor_lessons add column status text not null default 'planned'
  check (status in ('planned','completed','canceled'));
-- Preserve the meaning of historical records that previously used their date as completion.
update public.tutor_lessons set status='completed' where starts_at<=now();
create index tutor_lessons_student_schedule_idx on public.tutor_lessons(student_id,starts_at desc);
-- Raw lesson rows remain teacher-only: private comments must never reach a student.
-- The existing SECURITY DEFINER API calls these private INVOKER helpers after auth checks.
create or replace function tutor_private.teaching_data(p_preview boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); admin boolean:=tutor_private.is_teacher() and not p_preview; base jsonb; works jsonb;
begin
  base:=tutor_private.api_v1('data',jsonb_build_object('preview',p_preview));
  if not admin then
    base:=base||jsonb_build_object(
      'modules',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('revision',m.version,'published_version',m.version,'assigned',exists(select 1 from public.tutor_module_assignments a where a.module_id=m.id and a.student_id=uid)) order by m.published_at desc) from public.tutor_publications m where tutor_private.can_read_module(m.id)),'[]'::jsonb),
      'topics',coalesce((select jsonb_agg(to_jsonb(t) order by t.position,t.created_at) from public.tutor_topics t where tutor_private.can_read_topic(t.id)),'[]'::jsonb),
      'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.position) from public.tutor_published_tasks t where t.active and tutor_private.can_read_module(t.module_id)),'[]'::jsonb)
    );
  else
    base:=base||jsonb_build_object(
      'modules',coalesce((select jsonb_agg(x||jsonb_build_object('audience',coalesce(p.audience,'all'))) from jsonb_array_elements(base->'modules') x left join public.tutor_publications p on p.id=(x->>'id')::uuid),'[]'::jsonb),
      'topics',coalesce((select jsonb_agg(to_jsonb(t) order by t.position,t.created_at) from public.tutor_topics t where t.owner_id=uid),'[]'::jsonb),
      'student_progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.tutor_progress p join public.tutor_modules m on m.id=p.module_id where m.owner_id=uid and not p.is_preview and exists(select 1 from public.tutor_student_links l where l.teacher_id=uid and l.student_id=p.user_id)),'[]'::jsonb),
      'review_queue',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('criteria',coalesce(k.key_data->>'criteria',pk.criteria,'')) order by a.created_at) from public.tutor_attempts a join public.tutor_modules m on m.id=a.module_id left join tutor_private.attempt_keys k on k.attempt_id=a.id left join tutor_private.published_keys pk on pk.task_id=a.task_id where m.owner_id=uid and a.status='pending' and (not a.is_preview or a.student_id=uid)),'[]'::jsonb)
    );
  end if;
  select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.tutor_homework_items i where i.homework_id=h.id),'[]'::jsonb)) order by h.assigned_at desc),'[]'::jsonb) into works
    from public.tutor_homework h where (admin and h.teacher_id=uid) or (p_preview and h.teacher_id=uid) or (not admin and not p_preview and h.student_id=uid and tutor_private.can_read_homework(h.id));
  return base||jsonb_build_object(
    'homeworks',works,
    'assignable_tasks',case when admin then coalesce((select jsonb_agg(to_jsonb(t) order by t.title) from public.tutor_published_tasks t join public.tutor_publications m on m.id=t.module_id where t.active and m.visible and m.owner_id=uid),'[]'::jsonb) else '[]'::jsonb end,
    'students',case when admin then coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('display_name',p.display_name,'notes',coalesce(n.notes,'')) order by l.created_at desc) from public.tutor_student_links l join public.tutor_profiles p on p.user_id=l.student_id left join public.tutor_student_notes n using(teacher_id,student_id) where l.teacher_id=uid),'[]'::jsonb) else '[]'::jsonb end,
    'teachers',case when not admin and not p_preview then coalesce((select jsonb_agg(jsonb_build_object('teacher_id',l.teacher_id,'display_name',p.display_name,'status',l.status,'started_on',l.started_on)) from public.tutor_student_links l join public.tutor_profiles p on p.user_id=l.teacher_id where l.student_id=uid),'[]'::jsonb) else '[]'::jsonb end,
    'assignments',coalesce((select jsonb_agg(to_jsonb(a)) from public.tutor_module_assignments a where (admin and a.teacher_id=uid) or (not admin and a.student_id=uid and tutor_private.can_read_module(a.module_id))),'[]'::jsonb),
    'invites',case when admin then coalesce((select jsonb_agg(to_jsonb(i)-'token_hash' order by i.created_at desc) from tutor_private.student_invites i where i.teacher_id=uid),'[]'::jsonb) else '[]'::jsonb end,
    'lessons',case when admin then coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('topic_ids',coalesce((select jsonb_agg(t.topic_id) from public.tutor_lesson_topics t where t.lesson_id=l.id),'[]'::jsonb),'homework_ids',coalesce((select jsonb_agg(h.homework_id) from public.tutor_lesson_homework h where h.lesson_id=l.id),'[]'::jsonb)) order by l.starts_at desc) from public.tutor_lessons l where l.teacher_id=uid),'[]'::jsonb) else coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'teacher_id',l.teacher_id,'student_id',l.student_id,
      'starts_at',l.starts_at,'duration_minutes',l.duration_minutes,'status',l.status,
      'topic_ids',coalesce((select jsonb_agg(t.topic_id) from public.tutor_lesson_topics t where t.lesson_id=l.id and tutor_private.can_read_topic(t.topic_id)),'[]'::jsonb),
      'homework_ids',coalesce((select jsonb_agg(h.homework_id) from public.tutor_lesson_homework h where h.lesson_id=l.id and tutor_private.can_read_homework(h.homework_id)),'[]'::jsonb)
    ) order by l.starts_at desc) from public.tutor_lessons l
      join public.tutor_student_links link on link.teacher_id=l.teacher_id and link.student_id=l.student_id
      where not p_preview and l.student_id=uid and link.status='active'),'[]'::jsonb) end
  );
end $$;

create or replace function tutor_private.lesson_api(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();sid uuid:=(p->>'student_id')::uuid;lid uuid;topics uuid[];works uuid[];v_status text;
begin
  if not tutor_private.is_teacher() or not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Ученик недоступен' using errcode='42501';end if;
  topics:=array(select x::uuid from jsonb_array_elements_text(coalesce(p->'topic_ids','[]')) x);
  works:=array(select x::uuid from jsonb_array_elements_text(coalesce(p->'homework_ids','[]')) x);
  if cardinality(topics)>50 or cardinality(works)>50 then raise exception 'Слишком много связей';end if;
  if exists(select 1 from unnest(topics) x where not exists(select 1 from public.tutor_topics t where t.id=x and t.owner_id=uid)) or
    exists(select 1 from unnest(works) x where not exists(select 1 from public.tutor_homework h where h.id=x and h.teacher_id=uid and h.student_id=sid)) then raise exception 'Тема или работа недоступна' using errcode='42501';end if;
  lid:=coalesce((p->>'id')::uuid,gen_random_uuid());
  if exists(select 1 from public.tutor_lessons where id=lid and (teacher_id<>uid or student_id<>sid)) then raise exception 'Занятие недоступно' using errcode='42501';end if;
  select status into v_status from public.tutor_lessons where id=lid for update;
  v_status:=coalesce(p->>'status',v_status,'planned');
  if v_status not in ('planned','completed','canceled') then raise exception 'Выберите статус занятия';end if;
  insert into public.tutor_lessons(id,teacher_id,student_id,starts_at,duration_minutes,comment,status) values(lid,uid,sid,(p->>'starts_at')::timestamptz,(p->>'duration_minutes')::integer,coalesce(p->>'comment',''),v_status)
    on conflict(id) do update set starts_at=excluded.starts_at,duration_minutes=excluded.duration_minutes,comment=excluded.comment,status=excluded.status;
  delete from public.tutor_lesson_topics where lesson_id=lid;delete from public.tutor_lesson_homework where lesson_id=lid;
  insert into public.tutor_lesson_topics select lid,x from unnest(topics) x on conflict do nothing;
  insert into public.tutor_lesson_homework select lid,x from unnest(works) x on conflict do nothing;
  return jsonb_build_object('id',lid);
end $$;

create or replace function tutor_private.homework_api(p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; hid uuid; lid uuid:=(p->>'lesson_id')::uuid; itemid uuid; chosen uuid[]; tid uuid; pos integer:=0; snap jsonb; key_json jsonb;
begin
  if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
  if p_action='homework_cancel' then
    update public.tutor_homework set canceled_at=coalesce(canceled_at,now()) where id=(p->>'id')::uuid and teacher_id=uid;
    if not found then raise exception 'Работа недоступна' using errcode='42501';end if;
    return '{"canceled":true}';
  end if;
  sid:=(p->>'student_id')::uuid;
  if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Выберите активного ученика' using errcode='42501';end if;
  if lid is not null then
    perform 1 from public.tutor_lessons where id=lid and teacher_id=uid and student_id=sid and status<>'canceled' for share;
    if not found then raise exception 'Выберите доступное занятие этого ученика' using errcode='42501';end if;
  end if;
  if jsonb_typeof(p->'task_ids') is distinct from 'array' then raise exception 'Выберите задания';end if;
  chosen:=array(select x::uuid from jsonb_array_elements_text(p->'task_ids') x);
  if cardinality(chosen) not between 1 and 100 or (select count(distinct x) from unnest(chosen) x)<>cardinality(chosen) then raise exception 'Выберите от 1 до 100 разных заданий';end if;
  -- Lock publications before copying the safe task and private grading snapshots.
  perform 1 from public.tutor_publications pub where pub.id in(select t.module_id from public.tutor_published_tasks t where t.id=any(chosen)) order by pub.id for share;
  if (select count(*) from public.tutor_published_tasks t join public.tutor_publications pub on pub.id=t.module_id where t.id=any(chosen) and t.active and pub.visible and pub.owner_id=uid)<>cardinality(chosen) then raise exception 'Выберите задания из своих опубликованных модулей' using errcode='42501';end if;
  insert into public.tutor_homework(teacher_id,student_id,title,comment,due_at) values(uid,sid,btrim(p->>'title'),coalesce(p->>'comment',''),(p->>'due_at')::timestamptz) returning id into hid;
  foreach tid in array chosen loop
    select to_jsonb(t) into snap from public.tutor_published_tasks t where t.id=tid;
    select to_jsonb(k)-'task_id' into key_json from tutor_private.published_keys k where k.task_id=tid;
    insert into public.tutor_homework_items(homework_id,task_id,position,snapshot) values(hid,tid,pos,snap) returning id into itemid;
    insert into tutor_private.homework_keys values(itemid,key_json);pos:=pos+1;
  end loop;
  if lid is not null then insert into public.tutor_lesson_homework values(lid,hid);end if;
  return jsonb_build_object('id',hid);
end $$;
revoke all on function tutor_private.teaching_data(boolean),tutor_private.lesson_api(jsonb),tutor_private.homework_api(text,jsonb) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
