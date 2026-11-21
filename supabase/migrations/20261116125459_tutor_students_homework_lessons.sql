-- Stage 2. Only Tutor tables and policies change. Existing public publications stay public.
begin;
alter table public.tutor_publications add column audience text not null default 'all' check (audience in ('all','assigned'));
create table public.tutor_student_links (
  teacher_id uuid not null references auth.users(id), student_id uuid not null references auth.users(id),
  nickname text not null default '' check(length(nickname)<=100), started_on date not null default current_date,
  status text not null default 'active' check(status in ('active','archived')), created_at timestamptz not null default now(),
  primary key(teacher_id,student_id), check(teacher_id<>student_id)
);
create index tutor_student_links_student_idx on public.tutor_student_links(student_id,status);
create table public.tutor_student_notes (
  teacher_id uuid not null,student_id uuid not null,notes text not null default '' check(length(notes)<=20000),
  primary key(teacher_id,student_id), foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create table tutor_private.student_invites (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references auth.users(id),
  token_hash text unique not null, label text not null default '' check(length(label)<=100),
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
  used_by uuid references auth.users(id), used_at timestamptz, revoked boolean not null default false
);
create index tutor_student_invites_teacher_idx on tutor_private.student_invites(teacher_id);
create index tutor_student_invites_user_idx on tutor_private.student_invites(used_by);
create table public.tutor_module_assignments (
  module_id uuid not null references public.tutor_modules(id), teacher_id uuid not null,student_id uuid not null,
  assigned_at timestamptz not null default now(),primary key(module_id,student_id),
  foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create index tutor_module_assignments_link_idx on public.tutor_module_assignments(teacher_id,student_id);
create index tutor_module_assignments_student_idx on public.tutor_module_assignments(student_id);
create table public.tutor_homework (
  id uuid primary key default gen_random_uuid(),teacher_id uuid not null,student_id uuid not null,
  title text not null check(length(btrim(title)) between 1 and 200),comment text not null default '' check(length(comment)<=20000),
  due_at timestamptz,assigned_at timestamptz not null default now(),canceled_at timestamptz,
  foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create index tutor_homework_teacher_idx on public.tutor_homework(teacher_id,assigned_at desc);
create index tutor_homework_student_idx on public.tutor_homework(student_id,due_at);
create table public.tutor_homework_items (
  id uuid primary key default gen_random_uuid(),homework_id uuid not null references public.tutor_homework(id),
  task_id uuid not null references public.tutor_published_tasks(id),position integer not null,
  snapshot jsonb not null,unique(homework_id,task_id),unique(homework_id,position)
);
create index tutor_homework_items_task_idx on public.tutor_homework_items(task_id);
create table tutor_private.homework_keys (
  item_id uuid primary key references public.tutor_homework_items(id),key_data jsonb not null
);
create table tutor_private.attempt_keys (
  attempt_id uuid primary key references public.tutor_attempts(id) on delete cascade,key_data jsonb not null
);
alter table public.tutor_attempts add column homework_item_id uuid references public.tutor_homework_items(id);
create index tutor_attempts_homework_idx on public.tutor_attempts(homework_item_id,student_id,is_preview,created_at desc);
create table public.tutor_lessons (
  id uuid primary key default gen_random_uuid(),teacher_id uuid not null,student_id uuid not null,
  starts_at timestamptz not null,duration_minutes integer not null check(duration_minutes between 1 and 480),
  comment text not null default '' check(length(comment)<=20000),created_at timestamptz not null default now(),
  foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create index tutor_lessons_link_idx on public.tutor_lessons(teacher_id,student_id,starts_at desc);
create table public.tutor_lesson_topics (
  lesson_id uuid not null references public.tutor_lessons(id),topic_id uuid not null references public.tutor_topics(id),primary key(lesson_id,topic_id)
);
create index tutor_lesson_topics_topic_idx on public.tutor_lesson_topics(topic_id);
create table public.tutor_lesson_homework (
  lesson_id uuid not null references public.tutor_lessons(id),homework_id uuid not null references public.tutor_homework(id),primary key(lesson_id,homework_id)
);
create index tutor_lesson_homework_work_idx on public.tutor_lesson_homework(homework_id);

create function tutor_private.can_read_module(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.tutor_publications p where p.id=p_id and p.visible and (
    p.audience='all' or (p.owner_id=auth.uid() and tutor_private.is_teacher()) or
    exists(select 1 from public.tutor_module_assignments a join public.tutor_student_links l using(teacher_id,student_id)
      where a.module_id=p.id and a.teacher_id=p.owner_id and a.student_id=auth.uid() and l.status='active')
  ));
$$;
create function tutor_private.can_read_topic(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  with recursive descendants(id) as (
    select p_id union select t.id from public.tutor_topics t join descendants d on t.parent_id=d.id
  ) select auth.uid() is not null and (
    exists(select 1 from public.tutor_topics t where t.id=p_id and t.owner_id=auth.uid() and tutor_private.is_teacher()) or
    exists(select 1 from public.tutor_publications p join descendants d on d.id=p.topic_id where tutor_private.can_read_module(p.id))
  );
$$;
create function tutor_private.can_read_homework(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.tutor_homework h where h.id=p_id and (
    (h.teacher_id=auth.uid() and tutor_private.is_teacher()) or (h.student_id=auth.uid() and exists(
      select 1 from public.tutor_student_links l where l.teacher_id=h.teacher_id and l.student_id=h.student_id and l.status='active'))));
$$;
revoke all on function tutor_private.can_read_module(uuid),tutor_private.can_read_topic(uuid),tutor_private.can_read_homework(uuid) from public,anon;
grant execute on function tutor_private.can_read_module(uuid),tutor_private.can_read_topic(uuid),tutor_private.can_read_homework(uuid) to authenticated;

do $$ declare t text; begin
  foreach t in array array['tutor_student_links','tutor_student_notes','tutor_module_assignments','tutor_homework','tutor_homework_items','tutor_lessons','tutor_lesson_topics','tutor_lesson_homework'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['student_invites','homework_keys','attempt_keys'] loop
    execute format('alter table tutor_private.%I enable row level security',t);
    execute format('revoke all on tutor_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
create policy tutor_links_read on public.tutor_student_links for select to authenticated using((teacher_id=(select auth.uid()) and (select tutor_private.is_teacher())) or student_id=(select auth.uid()));
create policy tutor_notes_private on public.tutor_student_notes for select to authenticated using(teacher_id=(select auth.uid()) and (select tutor_private.is_teacher()));
create policy tutor_assignments_read on public.tutor_module_assignments for select to authenticated using((teacher_id=(select auth.uid()) and (select tutor_private.is_teacher())) or (student_id=(select auth.uid()) and tutor_private.can_read_module(module_id)));
create policy tutor_homework_read on public.tutor_homework for select to authenticated using(tutor_private.can_read_homework(id));
create policy tutor_homework_items_read on public.tutor_homework_items for select to authenticated using(tutor_private.can_read_homework(homework_id));
create policy tutor_lessons_private on public.tutor_lessons for select to authenticated using(teacher_id=(select auth.uid()) and (select tutor_private.is_teacher()));
create policy tutor_lesson_topics_read on public.tutor_lesson_topics for select to authenticated using(exists(select 1 from public.tutor_lessons l where l.id=lesson_id and l.teacher_id=(select auth.uid())));
create policy tutor_lesson_homework_read on public.tutor_lesson_homework for select to authenticated using(exists(select 1 from public.tutor_lessons l where l.id=lesson_id and l.teacher_id=(select auth.uid())));
drop policy tutor_publications_read on public.tutor_publications;
create policy tutor_publications_read on public.tutor_publications for select to authenticated using(tutor_private.can_read_module(id));
drop policy tutor_published_tasks_read on public.tutor_published_tasks;
create policy tutor_published_tasks_read on public.tutor_published_tasks for select to authenticated using(active and tutor_private.can_read_module(module_id));
drop policy tutor_topics_read on public.tutor_topics;
create policy tutor_topics_read on public.tutor_topics for select to authenticated using(tutor_private.can_read_topic(id));
create policy tutor_profile_linked on public.tutor_profiles for select to authenticated using(exists(
  select 1 from public.tutor_student_links l where (l.teacher_id=(select auth.uid()) and l.student_id=user_id and (select tutor_private.is_teacher())) or (l.student_id=(select auth.uid()) and l.teacher_id=user_id)));
create policy tutor_progress_teacher on public.tutor_progress for select to authenticated using(not is_preview and exists(
  select 1 from public.tutor_modules m join public.tutor_student_links l on l.teacher_id=m.owner_id where m.id=module_id and m.owner_id=(select auth.uid()) and l.student_id=user_id and (select tutor_private.is_teacher())));

-- Pure shared grading. Keys are passed only inside the private API boundary.
create function tutor_private.grade_answer(p_task jsonb,p_key jsonb,p_answer jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare kind text:=p_task->>'type'; actual text; expected text; verdict text:='wrong'; v_feedback jsonb:='{}';
begin
  if p_answer is null or jsonb_typeof(p_answer)='null' or pg_column_size(p_answer)>20000 then raise exception 'Проверьте ответ'; end if;
  if kind='manual' then
    if jsonb_typeof(p_answer)<>'string' or length(btrim(p_answer#>>'{}'))=0 then raise exception 'Введите решение для преподавателя'; end if;
    verdict:='pending';
  elsif kind in ('number','text','single') then
    if jsonb_typeof(p_answer)<>'string' then raise exception 'Ожидается строка ответа'; end if;
    actual:=btrim(p_answer#>>'{}'); expected:=btrim(p_key->>'answer');
    if kind='number' then
      if length(actual)>1000 or actual !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' then raise exception 'Введите точное число без пробелов внутри'; end if;
      if replace(actual,',','.')::numeric=replace(expected,',','.')::numeric then verdict:='correct'; end if;
    elsif kind='single' then
      if not exists(select 1 from jsonb_array_elements(p_task->'options') o where o->>'id'=actual) then raise exception 'Выберите вариант ответа'; end if;
      if actual=expected then verdict:='correct'; end if;
    else
      if (p_key->>'collapse_spaces')::boolean then actual:=regexp_replace(actual,'\s+',' ','g');expected:=regexp_replace(expected,'\s+',' ','g');end if;
      if (p_key->>'ignore_case')::boolean then actual:=lower(actual);expected:=lower(expected);end if;
      if actual=expected then verdict:='correct';end if;
    end if;
  elsif kind='multiple' then
    if jsonb_typeof(p_answer)<>'array' or jsonb_array_length(p_answer)=0 then raise exception 'Выберите варианты ответа';end if;
    if exists(select 1 from jsonb_array_elements(p_answer) v where jsonb_typeof(v)<>'string' or not exists(select 1 from jsonb_array_elements(p_task->'options') o where o->'id'=v)) then raise exception 'Неизвестный вариант';end if;
    if (select count(distinct v) from jsonb_array_elements(p_answer) v)<>jsonb_array_length(p_answer) then raise exception 'Повтор варианта';end if;
    if p_answer @> (p_key->'answer') and p_answer <@ (p_key->'answer') then verdict:='correct';end if;
  else raise exception 'Тип задания не поддерживается';end if;
  if verdict<>'pending' and (p_key->>'reveal'='after_attempt' or (p_key->>'reveal'='after_correct' and verdict='correct')) then
    v_feedback:=jsonb_build_object('answer',p_key->'answer','solution',p_key->>'solution','common_mistakes',p_key->>'common_mistakes');
  end if;
  return jsonb_build_object('status',verdict,'feedback',v_feedback);
end $$;
revoke all on function tutor_private.grade_answer(jsonb,jsonb,jsonb) from public,anon,authenticated;

-- Preserve the tested module editor, but prevent direct calls to the old entry point.
alter function tutor_private.api(text,jsonb) rename to api_v1;
revoke all on function tutor_private.api_v1(text,jsonb) from public,anon,authenticated;

create function tutor_private.teaching_data(p_preview boolean) returns jsonb
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
    'lessons',case when admin then coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('topic_ids',coalesce((select jsonb_agg(t.topic_id) from public.tutor_lesson_topics t where t.lesson_id=l.id),'[]'::jsonb),'homework_ids',coalesce((select jsonb_agg(h.homework_id) from public.tutor_lesson_homework h where h.lesson_id=l.id),'[]'::jsonb)) order by l.starts_at desc) from public.tutor_lessons l where l.teacher_id=uid),'[]'::jsonb) else '[]'::jsonb end
  );
end $$;
revoke all on function tutor_private.teaching_data(boolean) from public,anon,authenticated;

create function tutor_private.students_api(p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; mid uuid; code text; inv tutor_private.student_invites; result jsonb;
begin
  if p_action='student_join' then
    code:=lower(btrim(coalesce(p->>'code','')));
    if code !~ '^[0-9a-f-]{36}$' then raise exception 'Проверьте код приглашения';end if;
    select * into inv from tutor_private.student_invites where token_hash=encode(sha256(convert_to(code,'UTF8')),'hex') for update;
    if not found or inv.revoked or (inv.used_by is not null and inv.used_by<>uid) or (inv.used_by is null and inv.expires_at<=now()) then raise exception 'Приглашение недоступно или срок истёк';end if;
    if inv.teacher_id=uid then raise exception 'Нельзя добавить себя в собственные ученики. Для тестирования используйте режим ученика';end if;
    if exists(select 1 from public.tutor_student_links where teacher_id=inv.teacher_id and student_id=uid and status='archived') then raise exception 'Связь архивирована. Попросите преподавателя восстановить доступ';end if;
    if inv.used_by=uid then return jsonb_build_object('joined',true);end if;
    perform tutor_private.api_v1('data','{}');
    insert into public.tutor_student_links(teacher_id,student_id) values(inv.teacher_id,uid) on conflict do nothing;
    update tutor_private.student_invites set used_by=uid,used_at=now() where id=inv.id;
    return jsonb_build_object('joined',true);
  end if;
  if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
  if p_action='invite_create' then
    code:=gen_random_uuid()::text;
    insert into tutor_private.student_invites(teacher_id,token_hash,label) values(uid,encode(sha256(convert_to(code,'UTF8')),'hex'),coalesce(p->>'label','')) returning to_jsonb(student_invites.*)-'token_hash' into result;
    return result||jsonb_build_object('code',code);
  end if;
  if p_action='invite_revoke' then
    update tutor_private.student_invites set revoked=true where id=(p->>'id')::uuid and teacher_id=uid and used_by is null;
    if not found then raise exception 'Приглашение недоступно';end if;
    return '{"revoked":true}';
  end if;
  sid:=(p->>'student_id')::uuid;
  if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid) then raise exception 'Ученик недоступен' using errcode='42501';end if;
  if p_action='student_save' then
    update public.tutor_student_links set nickname=btrim(coalesce(p->>'nickname','')),started_on=(p->>'started_on')::date,status=p->>'status' where teacher_id=uid and student_id=sid;
    insert into public.tutor_student_notes values(uid,sid,coalesce(p->>'notes','')) on conflict(teacher_id,student_id) do update set notes=excluded.notes;
    return '{"saved":true}';
  end if;
  mid:=(p->>'module_id')::uuid;
  if not exists(select 1 from public.tutor_modules where id=mid and owner_id=uid) then raise exception 'Модуль недоступен' using errcode='42501';end if;
  if p_action='module_assign' then
    if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Ученик архивирован';end if;
    if not exists(select 1 from public.tutor_publications where id=mid and visible) then raise exception 'Сначала опубликуйте модуль';end if;
    insert into public.tutor_module_assignments values(mid,uid,sid,now()) on conflict(module_id,student_id) do nothing;
  elsif p_action='module_revoke' then delete from public.tutor_module_assignments where module_id=mid and teacher_id=uid and student_id=sid;
  else raise exception 'Неизвестное действие';end if;
  return '{"saved":true}';
end $$;
revoke all on function tutor_private.students_api(text,jsonb) from public,anon,authenticated;

create function tutor_private.homework_api(p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; hid uuid; itemid uuid; chosen uuid[]; tid uuid; pos integer:=0; snap jsonb; key_json jsonb;
begin
  if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
  if p_action='homework_cancel' then
    update public.tutor_homework set canceled_at=coalesce(canceled_at,now()) where id=(p->>'id')::uuid and teacher_id=uid;
    if not found then raise exception 'Работа недоступна' using errcode='42501';end if;
    return '{"canceled":true}';
  end if;
  sid:=(p->>'student_id')::uuid;
  if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Выберите активного ученика' using errcode='42501';end if;
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
  return jsonb_build_object('id',hid);
end $$;
revoke all on function tutor_private.homework_api(text,jsonb) from public,anon,authenticated;

create function tutor_private.lesson_api(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();sid uuid:=(p->>'student_id')::uuid;lid uuid;topics uuid[];works uuid[];
begin
  if not tutor_private.is_teacher() or not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Ученик недоступен' using errcode='42501';end if;
  topics:=array(select x::uuid from jsonb_array_elements_text(coalesce(p->'topic_ids','[]')) x);
  works:=array(select x::uuid from jsonb_array_elements_text(coalesce(p->'homework_ids','[]')) x);
  if cardinality(topics)>50 or cardinality(works)>50 then raise exception 'Слишком много связей';end if;
  if exists(select 1 from unnest(topics) x where not exists(select 1 from public.tutor_topics t where t.id=x and t.owner_id=uid)) or
    exists(select 1 from unnest(works) x where not exists(select 1 from public.tutor_homework h where h.id=x and h.teacher_id=uid and h.student_id=sid)) then raise exception 'Тема или работа недоступна' using errcode='42501';end if;
  lid:=coalesce((p->>'id')::uuid,gen_random_uuid());
  if exists(select 1 from public.tutor_lessons where id=lid and (teacher_id<>uid or student_id<>sid)) then raise exception 'Занятие недоступно' using errcode='42501';end if;
  insert into public.tutor_lessons(id,teacher_id,student_id,starts_at,duration_minutes,comment) values(lid,uid,sid,(p->>'starts_at')::timestamptz,(p->>'duration_minutes')::integer,coalesce(p->>'comment',''))
    on conflict(id) do update set starts_at=excluded.starts_at,duration_minutes=excluded.duration_minutes,comment=excluded.comment;
  delete from public.tutor_lesson_topics where lesson_id=lid;delete from public.tutor_lesson_homework where lesson_id=lid;
  insert into public.tutor_lesson_topics select lid,x from unnest(topics) x on conflict do nothing;
  insert into public.tutor_lesson_homework select lid,x from unnest(works) x on conflict do nothing;
  return jsonb_build_object('id',lid);
end $$;
revoke all on function tutor_private.lesson_api(jsonb) from public,anon,authenticated;

create function tutor_private.submit_attempt(p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();preview boolean:=coalesce((p->>'preview')::boolean,false);rid uuid:=(p->>'request_id')::uuid;
  item public.tutor_homework_items;work public.tutor_homework;task public.tutor_published_tasks;attempt public.tutor_attempts;
  snap jsonb;key_json jsonb;graded jsonb;mid uuid;topic uuid;itemid uuid:=(p->>'homework_item_id')::uuid;
begin
  if rid is null then raise exception 'Отсутствует идентификатор попытки';end if;
  select * into attempt from public.tutor_attempts where student_id=uid and request_id=rid;
  if found then return to_jsonb(attempt);end if;
  if itemid is not null then
    select * into item from public.tutor_homework_items where id=itemid;
    if not found then raise exception 'Задание недоступно' using errcode='42501';end if;
    select * into work from public.tutor_homework where id=item.homework_id for share;
    if work.canceled_at is not null or not ((not preview and work.student_id=uid and tutor_private.can_read_homework(work.id)) or (preview and work.teacher_id=uid)) then raise exception 'Домашняя работа недоступна' using errcode='42501';end if;
    snap:=item.snapshot;
    if snap->>'id' is distinct from p->>'task_id' then raise exception 'Задание не принадлежит работе';end if;
    select key_data into key_json from tutor_private.homework_keys where item_id=itemid;
  else
    select t.* into task from public.tutor_published_tasks t join public.tutor_publications pub on pub.id=t.module_id where t.id=(p->>'task_id')::uuid and t.active and tutor_private.can_read_module(t.module_id) for share of t,pub;
    if not found then raise exception 'Задание недоступно' using errcode='42501';end if;
    snap:=to_jsonb(task);select to_jsonb(k)-'task_id' into key_json from tutor_private.published_keys k where k.task_id=task.id;
  end if;
  if (snap->>'version')::integer is distinct from (p->>'version')::integer then raise exception 'Задание обновилось. Обновите страницу';end if;
  mid:=(snap->>'module_id')::uuid;select topic_id into topic from public.tutor_modules where id=mid;
  graded:=tutor_private.grade_answer(snap,key_json,p->'answer');
  insert into public.tutor_attempts(student_id,task_id,module_id,topic_id,publication_version,answer,status,feedback,task_snapshot,is_preview,request_id,homework_item_id)
    values(uid,(snap->>'id')::uuid,mid,topic,(snap->>'version')::integer,p->'answer',graded->>'status',graded->'feedback',snap,preview,rid,itemid)
    on conflict(student_id,request_id) do nothing returning * into attempt;
  if attempt.id is null then select * into attempt from public.tutor_attempts where student_id=uid and request_id=rid;
  elsif attempt.status='pending' then insert into tutor_private.attempt_keys values(attempt.id,key_json);end if;
  return to_jsonb(attempt);
end $$;
revoke all on function tutor_private.submit_attempt(jsonb) from public,anon,authenticated;

create function tutor_private.api(p_action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();preview boolean:=coalesce((p->>'preview')::boolean,false);a public.tutor_attempts;key_json jsonb;fb jsonb;
begin
  if uid is null then raise exception 'Требуется вход в аккаунт' using errcode='42501';end if;
  if preview and not tutor_private.is_teacher() then raise exception 'Режим просмотра доступен преподавателю' using errcode='42501';end if;
  if pg_column_size(p)>2000000 then raise exception 'Слишком большой запрос';end if;
  if p_action='data' then return tutor_private.teaching_data(preview);end if;
  if p_action='attempt' then return tutor_private.submit_attempt(p);end if;
  if p_action='progress' and not tutor_private.can_read_module((p->>'module_id')::uuid) then raise exception 'Модуль недоступен' using errcode='42501';end if;
  if p_action in ('student_join','invite_create','invite_revoke','student_save','module_assign','module_revoke') then return tutor_private.students_api(p_action,p);end if;
  if p_action in ('homework_create','homework_cancel') then return tutor_private.homework_api(p_action,p);end if;
  if p_action='lesson_save' then return tutor_private.lesson_api(p);end if;
  if p_action='module_access' then
    if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
    update public.tutor_publications set audience=p->>'audience' where id=(p->>'module_id')::uuid and owner_id=uid;
    if not found then raise exception 'Сначала опубликуйте свой модуль' using errcode='42501';end if;
    return '{"saved":true}';
  end if;
  if p_action='review' then
    if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
    if coalesce(p->>'status','') not in ('correct','wrong') then raise exception 'Выберите результат';end if;
    select x.* into a from public.tutor_attempts x join public.tutor_modules m on m.id=x.module_id where x.id=(p->>'attempt_id')::uuid and m.owner_id=uid for update of x;
    if not found then raise exception 'Попытка недоступна' using errcode='42501';end if;
    if a.status<>'pending' then raise exception 'Попытка уже проверена';end if;
    select key_data into key_json from tutor_private.attempt_keys where attempt_id=a.id;
    if key_json is null then select to_jsonb(k) into key_json from tutor_private.published_keys k where k.task_id=a.task_id;end if;
    fb:=jsonb_build_object('comment',coalesce(p->>'comment',''));
    if key_json->>'reveal'='after_attempt' or (key_json->>'reveal'='after_correct' and p->>'status'='correct') then fb:=fb||jsonb_build_object('solution',key_json->>'solution','common_mistakes',key_json->>'common_mistakes');end if;
    update public.tutor_attempts set status=p->>'status',feedback=fb,reviewed_at=now(),reviewer_id=uid where id=a.id;
    return '{"reviewed":true}';
  end if;
  return tutor_private.api_v1(p_action,p);
end $$;
revoke all on function tutor_private.api(text,jsonb) from public,anon;
grant execute on function tutor_private.api(text,jsonb) to authenticated;
create or replace function public.tutor_api(p_action text,p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select tutor_private.api(p_action,p); $$;
revoke all on function public.tutor_api(text,jsonb) from public,anon;
grant execute on function public.tutor_api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
