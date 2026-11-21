-- Extend the existing Tutor homework system; keep all previous rows and grading keys.
begin;
alter table public.tutor_homework add column requires_submission boolean not null default false;
create table public.tutor_student_note_entries (
 id uuid primary key default gen_random_uuid(), teacher_id uuid not null, student_id uuid not null,
 body text not null check(length(btrim(body))>0), noted_on date not null default current_date,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(), deleted_at timestamptz,
 foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create index tutor_note_entries_link_date_idx on public.tutor_student_note_entries(teacher_id,student_id,noted_on desc,created_at desc);
-- Old free-form notes are copied once, not removed or overwritten.
insert into public.tutor_student_note_entries(teacher_id,student_id,body)
 select teacher_id,student_id,notes from public.tutor_student_notes where length(btrim(notes))>0;
create table public.tutor_homework_resources (
 id uuid primary key default gen_random_uuid(), homework_id uuid not null references public.tutor_homework(id),
 kind text not null check(kind in ('link','file')), position integer not null,
 url text, path text unique, filename text, mime_type text,
 check((kind='link' and url ~ '^https?://[^[:space:]]+$' and path is null) or
 (kind='file' and url is null and path is not null and filename is not null and filename ~* '\.(pdf|txt|csv|py|zip|docx|xlsx|pptx|png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg)$' and mime_type is not null)),
 unique(homework_id,position)
);
create table public.tutor_homework_submissions (
 id uuid primary key default gen_random_uuid(), homework_id uuid not null references public.tutor_homework(id),
 student_id uuid not null references auth.users(id), is_preview boolean not null default false,
 request_id uuid not null, answer text not null default '' check(length(answer)<=20000),
 status text not null default 'pending' check(status in ('pending','accepted','returned')),
 feedback text not null default '' check(length(feedback)<=20000),
 submitted_at timestamptz not null default clock_timestamp(), reviewed_at timestamptz, reviewer_id uuid references auth.users(id),
 unique(student_id,request_id)
);
create index tutor_homework_submissions_reviewer_idx on public.tutor_homework_submissions(reviewer_id);
create index tutor_homework_submissions_work_idx on public.tutor_homework_submissions(homework_id,student_id,is_preview,submitted_at desc);
do $$ declare t text; begin
 foreach t in array array['tutor_student_note_entries','tutor_homework_resources','tutor_homework_submissions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy tutor_session_active on public.%I as restrictive for select to authenticated using((select tutor_private.code_session_active()))',t);
 end loop;
end $$;
create policy tutor_note_entries_private on public.tutor_student_note_entries for select to authenticated
 using(teacher_id=(select auth.uid()) and (select tutor_private.is_teacher()) and deleted_at is null);
create policy tutor_homework_resources_read on public.tutor_homework_resources for select to authenticated
 using(tutor_private.can_read_homework(homework_id));
create policy tutor_homework_submissions_read on public.tutor_homework_submissions for select to authenticated
 using((student_id=(select auth.uid()) and tutor_private.can_read_homework(homework_id)) or
 (not is_preview and exists(select 1 from public.tutor_homework h where h.id=homework_id and h.teacher_id=(select auth.uid()) and (select tutor_private.is_teacher()))));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 select 'tutor-homework','tutor-homework',false,file_size_limit,allowed_mime_types from storage.buckets where id='tutor-theory';
create policy tutor_homework_file_upload on storage.objects for insert to authenticated with check(
 bucket_id='tutor-homework' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active())
 and lower(storage.extension(name)) in ('pdf','txt','csv','py','zip','docx','xlsx','pptx','png','jpg','jpeg','webp','gif','mp4','webm','mp3','wav','ogg'));
create policy tutor_homework_file_read on storage.objects for select to authenticated using(
 bucket_id='tutor-homework' and (select tutor_private.code_session_active()) and
 (exists(select 1 from public.tutor_homework_resources r where r.path=name and tutor_private.can_read_homework(r.homework_id)) or
 ((storage.foldername(name))[1]=(select auth.uid())::text and (select tutor_private.is_teacher()))));
create policy tutor_homework_file_cleanup on storage.objects for delete to authenticated using(
 bucket_id='tutor-homework' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active())
 and not exists(select 1 from public.tutor_homework_resources r where r.path=name));

create or replace function tutor_private.homework_api(p_action text,p jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; hid uuid; lid uuid:=(p->>'lesson_id')::uuid; itemid uuid; chosen uuid[]; tid uuid; pos integer:=0; snap jsonb; key_json jsonb; resource jsonb;
begin
 if not tutor_private.is_teacher() then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
 if p_action='homework_cancel' then
  update public.tutor_homework set canceled_at=coalesce(canceled_at,now()) where id=(p->>'id')::uuid and teacher_id=uid;
  if not found then raise exception 'Работа недоступна' using errcode='42501';end if;
  return '{"canceled":true}';
 end if;
 sid:=(p->>'student_id')::uuid;
 if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=sid and status='active') then raise exception 'Выберите активного ученика' using errcode='42501';end if;
 hid:=coalesce((p->>'id')::uuid,gen_random_uuid());
 if exists(select 1 from public.tutor_homework where id=hid) then
  if exists(select 1 from public.tutor_homework where id=hid and teacher_id=uid and student_id=sid) then return jsonb_build_object('id',hid);end if;
  raise exception 'Работа недоступна' using errcode='42501';
 end if;
 if lid is not null then
  perform 1 from public.tutor_lessons where id=lid and teacher_id=uid and student_id=sid and status<>'canceled' for share;
  if not found then raise exception 'Выберите доступное занятие этого ученика' using errcode='42501';end if;
 end if;
 if jsonb_typeof(coalesce(p->'task_ids','[]'))<>'array' or jsonb_typeof(coalesce(p->'resources','[]'))<>'array' then raise exception 'Проверьте задания и материалы';end if;
 chosen:=array(select x::uuid from jsonb_array_elements_text(coalesce(p->'task_ids','[]')) x);
 if cardinality(chosen)>100 or (select count(distinct x) from unnest(chosen) x)<>cardinality(chosen) then raise exception 'Выберите до 100 разных заданий';end if;
 if cardinality(chosen)=0 and length(btrim(coalesce(p->>'comment','')))=0 and jsonb_array_length(coalesce(p->'resources','[]'))=0 then raise exception 'Добавьте инструкции, материалы или задания';end if;
 perform 1 from public.tutor_publications pub where pub.id in(select t.module_id from public.tutor_published_tasks t where t.id=any(chosen)) order by pub.id for share;
 if (select count(*) from public.tutor_published_tasks t join public.tutor_publications pub on pub.id=t.module_id where t.id=any(chosen) and t.active and pub.visible and pub.owner_id=uid)<>cardinality(chosen) then raise exception 'Выберите задания из своих опубликованных модулей' using errcode='42501';end if;
 insert into public.tutor_homework(id,teacher_id,student_id,title,comment,due_at,requires_submission)
 values(hid,uid,sid,btrim(p->>'title'),coalesce(p->>'comment',''),(p->>'due_at')::timestamptz,coalesce((p->>'requires_submission')::boolean,false));
 foreach tid in array chosen loop
  select to_jsonb(t) into snap from public.tutor_published_tasks t where t.id=tid;
  select to_jsonb(k)-'task_id' into key_json from tutor_private.published_keys k where k.task_id=tid;
  insert into public.tutor_homework_items(homework_id,task_id,position,snapshot) values(hid,tid,pos,snap) returning id into itemid;
  insert into tutor_private.homework_keys values(itemid,key_json);pos:=pos+1;
 end loop;
 pos:=0;
 for resource in select * from jsonb_array_elements(coalesce(p->'resources','[]')) loop
  if resource->>'kind'='file' then
   if resource->>'path' not like uid::text||'/'||hid::text||'/%' or resource->>'path' !~ '\.(pdf|txt|csv|py|zip|docx|xlsx|pptx|png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg)$' then raise exception 'Недопустимый путь файла';end if;
   perform 1 from storage.objects where bucket_id='tutor-homework' and name=resource->>'path' for share;
   if not found then raise exception 'Файл ещё не загружен';end if;
  end if;
  insert into public.tutor_homework_resources(homework_id,kind,position,url,path,filename,mime_type)
   values(hid,resource->>'kind',pos,resource->>'url',resource->>'path',resource->>'filename',resource->>'mime_type');pos:=pos+1;
 end loop;
 if lid is not null then insert into public.tutor_lesson_homework values(lid,hid);end if;
 return jsonb_build_object('id',hid);
end $$;

-- The public entry point retains the existing authentication and code-session guards.
create function tutor_private.workspace_api(p_action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); preview boolean:=coalesce((p->>'preview')::boolean,false); base jsonb; work jsonb; works jsonb:='[]'; h public.tutor_homework; sub public.tutor_homework_submissions; latest public.tutor_homework_submissions; nid uuid;
begin
 if uid is null then raise exception 'Требуется вход в аккаунт' using errcode='42501';end if;
 if not tutor_private.code_session_active() then raise exception 'Доступ закрыт или код обновлён. Войдите заново по коду преподавателя' using errcode='42501';end if;
 if preview and not tutor_private.is_teacher() then raise exception 'Режим просмотра доступен преподавателю' using errcode='42501';end if;
 if pg_column_size(p)>2000000 then raise exception 'Слишком большой запрос';end if;
 if p_action in ('student_note_save','student_note_delete') then
  if not tutor_private.is_teacher() or preview then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
  if not exists(select 1 from public.tutor_student_links where teacher_id=uid and student_id=(p->>'student_id')::uuid) then raise exception 'Ученик недоступен' using errcode='42501';end if;
  nid:=(p->>'id')::uuid;
  if p_action='student_note_delete' then
   update public.tutor_student_note_entries set deleted_at=clock_timestamp() where id=nid and teacher_id=uid and student_id=(p->>'student_id')::uuid and deleted_at is null;
   if not found then raise exception 'Заметка недоступна' using errcode='42501';end if;
  elsif nid is null then
   insert into public.tutor_student_note_entries(teacher_id,student_id,body,noted_on) values(uid,(p->>'student_id')::uuid,btrim(p->>'body'),(p->>'noted_on')::date) returning id into nid;
  else
   update public.tutor_student_note_entries set body=btrim(p->>'body'),noted_on=(p->>'noted_on')::date,updated_at=clock_timestamp()
    where id=nid and teacher_id=uid and student_id=(p->>'student_id')::uuid and deleted_at is null;
   if not found then raise exception 'Заметка недоступна' using errcode='42501';end if;
  end if;
  return jsonb_build_object('id',nid);
 end if;
 if p_action in ('homework_submit','homework_review') then
  select * into h from public.tutor_homework where id=(p->>'id')::uuid for update;
  if not found or not tutor_private.can_read_homework(h.id) or h.canceled_at is not null then raise exception 'Работа недоступна' using errcode='42501';end if;
  if not h.requires_submission then raise exception 'Отдельный ответ для этой работы не требуется';end if;
  if p_action='homework_submit' then
   if (not preview and h.student_id<>uid) or (preview and h.teacher_id<>uid) then raise exception 'Работа недоступна' using errcode='42501';end if;
   select * into sub from public.tutor_homework_submissions where student_id=uid and request_id=(p->>'request_id')::uuid;
   if found then
    if sub.homework_id<>h.id or sub.is_preview<>preview then raise exception 'Повтор запроса не совпадает';end if;
    return to_jsonb(sub);
   end if;
   if length(btrim(coalesce(p->>'answer','')))=0 then raise exception 'Введите ответ преподавателю';end if;
   insert into public.tutor_homework_submissions(homework_id,student_id,is_preview,request_id,answer)
    values(h.id,uid,preview,(p->>'request_id')::uuid,btrim(p->>'answer')) returning * into sub;
  else
   if not tutor_private.is_teacher() or h.teacher_id<>uid or preview then raise exception 'Работа недоступна' using errcode='42501';end if;
   if coalesce(p->>'status','') not in ('accepted','returned') then raise exception 'Выберите результат';end if;
   select * into latest from public.tutor_homework_submissions where homework_id=h.id and student_id=h.student_id and not is_preview order by submitted_at desc,id desc limit 1;
   if (p->>'submission_id')::uuid is distinct from latest.id then raise exception 'Ответ обновился. Откройте работу заново';end if;
   if latest.id is null then
    insert into public.tutor_homework_submissions(homework_id,student_id,request_id,status,feedback,reviewed_at,reviewer_id)
     values(h.id,h.student_id,gen_random_uuid(),p->>'status',coalesce(p->>'feedback',''),clock_timestamp(),uid) returning * into sub;
   else
    update public.tutor_homework_submissions set status=p->>'status',feedback=coalesce(p->>'feedback',''),reviewed_at=clock_timestamp(),reviewer_id=uid where id=latest.id returning * into sub;
   end if;
  end if;
  return to_jsonb(sub);
 end if;
 base:=tutor_private.api(p_action,p);
 if p_action='data' then
  for work in select * from jsonb_array_elements(base->'homeworks') loop
   works:=works||jsonb_build_array(work||jsonb_build_object(
    'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.position) from public.tutor_homework_resources r where r.homework_id=(work->>'id')::uuid),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(to_jsonb(s) order by s.submitted_at desc,s.id desc) from public.tutor_homework_submissions s where s.homework_id=(work->>'id')::uuid and s.is_preview=preview and s.student_id=case when preview then uid else (work->>'student_id')::uuid end),'[]'::jsonb)));
  end loop;
  return base||jsonb_build_object('homeworks',works,'student_notes',case when tutor_private.is_teacher() and not preview then coalesce((select jsonb_agg(to_jsonb(n) order by n.noted_on desc,n.created_at desc) from public.tutor_student_note_entries n where n.teacher_id=uid and n.deleted_at is null),'[]'::jsonb) else '[]'::jsonb end);
 end if;
 return base;
end $$;
revoke all on function tutor_private.workspace_api(text,jsonb) from public,anon;
grant execute on function tutor_private.workspace_api(text,jsonb) to authenticated;
create or replace function public.tutor_api(p_action text,p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select tutor_private.workspace_api(p_action,p); $$;
notify pgrst,'reload schema';
commit;
