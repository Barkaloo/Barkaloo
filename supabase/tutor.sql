-- Historical Stage 1 snapshot, retained for reference only.
-- Current schema = all files in supabase/migrations/ in order (includes Stage 2).
-- Do not execute this snapshot on a migrated database.
-- Barkaloo Tutor MVP. Additive only: does not change app_state, Auth or existing policies.
begin;
create schema tutor_private;
revoke all on schema tutor_private from public, anon, authenticated;
grant usage on schema tutor_private to authenticated;

create table public.tutor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 100),
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now()
);
-- Only a database administrator can grant roles. Self registration never grants a role.
create table public.tutor_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'teacher')
);
create table public.tutor_sections (
  id uuid primary key default gen_random_uuid(), number integer unique not null check (number > 0),
  title text not null check (length(title) between 1 and 150), description text not null default '',
  position integer not null, active boolean not null default true
);
create table public.tutor_topics (
  id uuid primary key default gen_random_uuid(), section_id uuid not null references public.tutor_sections(id),
  parent_id uuid references public.tutor_topics(id), owner_id uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 150), description text not null default '',
  position integer not null default 0, created_at timestamptz not null default now()
);
create index tutor_topics_section_idx on public.tutor_topics(section_id, position);
create index tutor_topics_parent_idx on public.tutor_topics(parent_id);
create index tutor_topics_owner_idx on public.tutor_topics(owner_id);
create table public.tutor_modules (
  id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.tutor_topics(id),
  owner_id uuid not null references auth.users(id), title text not null check (length(title) between 1 and 200),
  description text not null default '', blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  revision integer not null default 1, updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create index tutor_modules_topic_idx on public.tutor_modules(topic_id);
create index tutor_modules_owner_idx on public.tutor_modules(owner_id);
create table public.tutor_tasks (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references public.tutor_modules(id),
  type text not null check (type in ('number','text','single','multiple','manual')),
  title text not null check (length(title) between 1 and 200), statement text not null,
  prototype text not null default '', difficulty integer not null default 1 check (difficulty between 1 and 3),
  options jsonb not null default '[]', position integer not null default 0
);
create index tutor_tasks_module_idx on public.tutor_tasks(module_id);
create table tutor_private.task_keys (
  task_id uuid primary key references public.tutor_tasks(id) on delete cascade,
  answer jsonb not null, solution text not null default '', common_mistakes text not null default '',
  criteria text not null default '', ignore_case boolean not null default false,
  collapse_spaces boolean not null default false,
  reveal text not null default 'after_attempt' check (reveal in ('after_attempt','after_correct','never'))
);
-- Publication snapshots prevent draft edits from leaking to students.
create table public.tutor_publications (
  id uuid primary key references public.tutor_modules(id), topic_id uuid not null references public.tutor_topics(id),
  owner_id uuid not null references auth.users(id), title text not null, description text not null,
  blocks jsonb not null, version integer not null, visible boolean not null default true, published_at timestamptz not null default now()
);
create index tutor_publications_topic_idx on public.tutor_publications(topic_id);
create index tutor_publications_owner_idx on public.tutor_publications(owner_id);
create table public.tutor_published_tasks (
  id uuid primary key references public.tutor_tasks(id), module_id uuid not null references public.tutor_publications(id),
  type text not null, title text not null, statement text not null, prototype text not null,
  difficulty integer not null, options jsonb not null, position integer not null, version integer not null,
  active boolean not null default true
);
create index tutor_published_tasks_module_idx on public.tutor_published_tasks(module_id);
create table tutor_private.published_keys (
  task_id uuid primary key references public.tutor_published_tasks(id), answer jsonb not null,
  solution text not null, common_mistakes text not null, criteria text not null,
  ignore_case boolean not null, collapse_spaces boolean not null, reveal text not null
);
create table public.tutor_attempts (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references auth.users(id),
  task_id uuid not null references public.tutor_published_tasks(id), module_id uuid not null references public.tutor_modules(id),
  topic_id uuid not null references public.tutor_topics(id), publication_version integer not null,
  answer jsonb not null, status text not null check (status in ('correct','wrong','pending')),
  feedback jsonb not null default '{}', task_snapshot jsonb not null,
  is_preview boolean not null default false, request_id uuid not null,
  created_at timestamptz not null default now(), reviewed_at timestamptz, reviewer_id uuid references auth.users(id),
  unique (student_id, request_id)
);
create index tutor_attempts_student_idx on public.tutor_attempts(student_id, is_preview, created_at desc);
create index tutor_attempts_task_idx on public.tutor_attempts(task_id);
create index tutor_attempts_module_idx on public.tutor_attempts(module_id);
create index tutor_attempts_topic_idx on public.tutor_attempts(topic_id);
create index tutor_attempts_reviewer_idx on public.tutor_attempts(reviewer_id);
create table public.tutor_progress (
  user_id uuid not null references auth.users(id), module_id uuid not null references public.tutor_modules(id),
  is_preview boolean not null default false, last_block_id text,
  completed_at timestamptz, updated_at timestamptz not null default now(),
  primary key(user_id, module_id, is_preview)
);
create index tutor_progress_module_idx on public.tutor_progress(module_id);

create function tutor_private.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.tutor_roles where user_id = auth.uid() and role = 'teacher');
$$;
revoke all on function tutor_private.is_teacher() from public, anon;
grant execute on function tutor_private.is_teacher() to authenticated;

-- No client-side writes, even for teachers. Writes go through the validated API.
do $$ declare t text; begin
  foreach t in array array['tutor_profiles','tutor_roles','tutor_sections','tutor_topics','tutor_modules','tutor_tasks','tutor_publications','tutor_published_tasks','tutor_attempts','tutor_progress'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
alter table tutor_private.task_keys enable row level security;
alter table tutor_private.published_keys enable row level security;
revoke all on all tables in schema tutor_private from public, anon, authenticated;

create policy tutor_profile_self on public.tutor_profiles for select to authenticated using (user_id = (select auth.uid()));
create policy tutor_role_self on public.tutor_roles for select to authenticated using (user_id = (select auth.uid()));
create policy tutor_sections_read on public.tutor_sections for select to authenticated using (active or (select tutor_private.is_teacher()));
create policy tutor_topics_read on public.tutor_topics for select to authenticated using (
  owner_id = (select auth.uid()) or exists(select 1 from public.tutor_publications p where p.topic_id = tutor_topics.id and p.visible));
create policy tutor_modules_owner on public.tutor_modules for select to authenticated using (owner_id = (select auth.uid()) and (select tutor_private.is_teacher()));
create policy tutor_tasks_owner on public.tutor_tasks for select to authenticated using (
  exists(select 1 from public.tutor_modules m where m.id = module_id and m.owner_id = (select auth.uid())));
create policy tutor_publications_read on public.tutor_publications for select to authenticated using (visible);
create policy tutor_published_tasks_read on public.tutor_published_tasks for select to authenticated using (
  active and exists(select 1 from public.tutor_publications p where p.id = module_id and p.visible));
create policy tutor_attempts_read on public.tutor_attempts for select to authenticated using (
  student_id = (select auth.uid()) or (not is_preview and exists(select 1 from public.tutor_modules m where m.id = module_id and m.owner_id = (select auth.uid()))));
create policy tutor_progress_read on public.tutor_progress for select to authenticated using (user_id = (select auth.uid()));

-- Single internal privileged boundary. Every branch checks identity and ownership.
-- The exposed wrapper below is SECURITY INVOKER; private schemas are not exposed to PostgREST.
create function tutor_private.api(p_action text, p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); teacher boolean; preview boolean := coalesce((p->>'preview')::boolean,false);
  mid uuid; tid uuid; sid uuid; rid uuid; expected integer; result jsonb; item jsonb;
  m public.tutor_modules; t public.tutor_tasks; pt public.tutor_published_tasks;
  k tutor_private.task_keys; pk tutor_private.published_keys; a public.tutor_attempts;
  input_answer jsonb; expected_answer jsonb; text_answer text; text_expected text;
  verdict text; v_feedback jsonb := '{}'; n integer; new_blocks jsonb;
begin
  if uid is null then raise exception 'Требуется вход в аккаунт' using errcode = '42501'; end if;
  teacher := tutor_private.is_teacher();
  if preview and not teacher then raise exception 'Режим просмотра доступен преподавателю' using errcode = '42501'; end if;
  if pg_catalog.pg_column_size(p) > 2000000 then raise exception 'Слишком большой запрос'; end if;

  if p_action = 'data' then
    insert into public.tutor_profiles(user_id,display_name)
      values(uid,coalesce(nullif(left((select email from auth.users where id = uid),100),''),'Ученик')) on conflict do nothing;
    return jsonb_build_object(
      'profile',(select to_jsonb(x) from public.tutor_profiles x where user_id = uid),
      'role',case when teacher then 'teacher' else 'student' end,
      'sections',coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.tutor_sections x where active or (teacher and not preview)),'[]'),
      'topics',coalesce((select jsonb_agg(to_jsonb(x) order by position,created_at) from public.tutor_topics x where
        (teacher and not preview and owner_id = uid) or exists(select 1 from public.tutor_publications y where y.topic_id = x.id and y.visible)),'[]'),
      'modules',case when teacher and not preview then coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('published_at',case when y.visible then y.published_at end,'published_version',case when y.visible then y.version end) order by x.updated_at desc)
        from public.tutor_modules x left join public.tutor_publications y on y.id = x.id where x.owner_id = uid),'[]')
        else coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('revision',version,'published_version',version) order by published_at desc) from public.tutor_publications x where visible),'[]') end,
      'tasks',case when teacher and not preview then coalesce((select jsonb_agg(to_jsonb(x)||to_jsonb(y)-'task_id' order by x.position)
        from public.tutor_tasks x join tutor_private.task_keys y on y.task_id = x.id join public.tutor_modules z on z.id = x.module_id where z.owner_id = uid),'[]')
        else coalesce((select jsonb_agg(to_jsonb(x) order by position) from public.tutor_published_tasks x join public.tutor_publications y on y.id = x.module_id where x.active and y.visible),'[]') end,
      'attempts',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc) from public.tutor_attempts x where
        (student_id = uid and is_preview = preview) or (teacher and not preview and not is_preview and exists(select 1 from public.tutor_modules y where y.id = x.module_id and y.owner_id = uid))),'[]'),
      'progress',coalesce((select jsonb_agg(to_jsonb(x)) from public.tutor_progress x where user_id = uid and is_preview = preview),'[]'),
      'review_queue',case when teacher and not preview then coalesce((select jsonb_agg(to_jsonb(x) order by created_at) from public.tutor_attempts x where status='pending' and (not is_preview or student_id=uid) and exists(select 1 from public.tutor_modules z where z.id=x.module_id and z.owner_id=uid)),'[]') else '[]'::jsonb end
    );
  end if;
  if p_action = 'profile' then
    update public.tutor_profiles set display_name = btrim(p->>'display_name'), theme = p->>'theme' where user_id = uid returning to_jsonb(tutor_profiles.*) into result;
    return result;
  end if;
  if p_action = 'attempt' then
    rid := (p->>'request_id')::uuid;
    if rid is null then raise exception 'Отсутствует идентификатор попытки'; end if;
    select * into a from public.tutor_attempts where student_id = uid and request_id = rid;
    if found then return to_jsonb(a); end if;
    select x.* into pt from public.tutor_published_tasks x join public.tutor_publications y on y.id = x.module_id
      where x.id = (p->>'task_id')::uuid and x.active and y.visible for share of x,y;
    if not found then raise exception 'Задание недоступно' using errcode = '42501'; end if;
    if pt.version is distinct from (p->>'version')::integer then raise exception 'Задание обновилось. Обновите страницу перед отправкой'; end if;
    select * into pk from tutor_private.published_keys where task_id = pt.id;
    input_answer := p->'answer'; expected_answer := pk.answer;
    if input_answer is null or pg_catalog.pg_column_size(input_answer) > 20000 then raise exception 'Проверьте ответ'; end if;
    verdict := 'wrong';
    if pt.type = 'manual' then
      if jsonb_typeof(input_answer) <> 'string' or length(btrim(input_answer #>> '{}')) = 0 then raise exception 'Введите ответ для преподавателя'; end if;
      verdict := 'pending';
    elsif pt.type in ('text','number','single') then
      if jsonb_typeof(input_answer) <> 'string' then raise exception 'Ожидается строка ответа'; end if;
      text_answer := btrim(input_answer #>> '{}'); text_expected := btrim(expected_answer #>> '{}');
      if pt.type = 'number' then
        if length(text_answer) > 1000 or text_answer !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' then raise exception 'Введите точное число без пробелов внутри'; end if;
        if replace(text_answer,',','.')::numeric = replace(text_expected,',','.')::numeric then verdict := 'correct'; end if;
      elsif pt.type = 'single' then
        if not exists(select 1 from jsonb_array_elements(pt.options) o where o->>'id' = text_answer) then raise exception 'Выберите вариант ответа'; end if;
        if text_answer = text_expected then verdict := 'correct'; end if;
      else
        if pk.collapse_spaces then text_answer := regexp_replace(text_answer,'\s+',' ','g'); text_expected := regexp_replace(text_expected,'\s+',' ','g'); end if;
        if pk.ignore_case then text_answer := lower(text_answer); text_expected := lower(text_expected); end if;
        if text_answer = text_expected then verdict := 'correct'; end if;
      end if;
    elsif pt.type = 'multiple' then
      if jsonb_typeof(input_answer) <> 'array' or jsonb_array_length(input_answer) = 0 then raise exception 'Выберите варианты ответа'; end if;
      if exists(select 1 from jsonb_array_elements(input_answer) v where jsonb_typeof(v) <> 'string' or not exists(select 1 from jsonb_array_elements(pt.options) o where o->'id' = v)) then raise exception 'Неизвестный вариант'; end if;
      if (select count(distinct v) from jsonb_array_elements(input_answer) v) <> jsonb_array_length(input_answer) then raise exception 'Повтор варианта'; end if;
      if input_answer @> expected_answer and input_answer <@ expected_answer then verdict := 'correct'; end if;
    end if;
    if verdict <> 'pending' and (pk.reveal = 'after_attempt' or (pk.reveal = 'after_correct' and verdict = 'correct')) then
      v_feedback := jsonb_build_object('answer',pk.answer,'solution',pk.solution,'common_mistakes',pk.common_mistakes);
    end if;
    select topic_id into tid from public.tutor_publications where id = pt.module_id;
    insert into public.tutor_attempts(student_id,task_id,module_id,topic_id,publication_version,answer,status,feedback,task_snapshot,is_preview,request_id)
      values(uid,pt.id,pt.module_id,tid,pt.version,input_answer,verdict,v_feedback,to_jsonb(pt),preview,rid)
      on conflict(student_id,request_id) do nothing returning * into a;
    if a.id is null then select * into a from public.tutor_attempts where student_id = uid and request_id = rid; end if;
    return to_jsonb(a);
  end if;
  if p_action = 'progress' then
    mid := (p->>'module_id')::uuid;
    if not exists(select 1 from public.tutor_publications where id = mid and visible) then raise exception 'Модуль недоступен' using errcode = '42501'; end if;
    insert into public.tutor_progress(user_id,module_id,is_preview,last_block_id,completed_at)
      values(uid,mid,preview,p->>'last_block_id',case when (p->>'complete')::boolean then now() end)
      on conflict(user_id,module_id,is_preview) do update set last_block_id = excluded.last_block_id,
      updated_at = now(), completed_at = coalesce(tutor_progress.completed_at,excluded.completed_at);
    return jsonb_build_object('saved',true);
  end if;

  if not teacher then raise exception 'Требуется роль преподавателя' using errcode = '42501'; end if;
  if p_action = 'section_save' then
    if p->>'id' is null then
      insert into public.tutor_sections(number,title,description,position) values((p->>'number')::integer,btrim(p->>'title'),coalesce(p->>'description',''),(p->>'position')::integer) returning id into sid;
    else
      update public.tutor_sections set title = btrim(p->>'title'), description = coalesce(p->>'description',''), number = (p->>'number')::integer,
        position = (p->>'position')::integer,active = (p->>'active')::boolean where id = (p->>'id')::uuid returning id into sid;
    end if;
    return jsonb_build_object('id',sid);
  end if;
  if p_action = 'topic_save' then
    sid := (p->>'section_id')::uuid; tid := (p->>'parent_id')::uuid;
    if tid is not null and not exists(select 1 from public.tutor_topics where id = tid and owner_id = uid and section_id = sid) then raise exception 'Родительская тема недоступна'; end if;
    if p->>'id' is null then
      insert into public.tutor_topics(section_id,parent_id,owner_id,title,description,position)
        values(sid,tid,uid,btrim(p->>'title'),coalesce(p->>'description',''),coalesce((p->>'position')::integer,0)) returning id into tid;
    else
      -- Parent is immutable during edit: avoids cycles in an existing topic tree.
      update public.tutor_topics set title = btrim(p->>'title'),description = coalesce(p->>'description','')
        where id = (p->>'id')::uuid and owner_id = uid returning id into tid;
      if not found then raise exception 'Тема недоступна' using errcode = '42501'; end if;
    end if;
    return jsonb_build_object('id',tid);
  end if;
  if p_action = 'module_create' then
    tid := (p->>'topic_id')::uuid;
    if not exists(select 1 from public.tutor_topics where id = tid and owner_id = uid) then raise exception 'Тема недоступна' using errcode = '42501'; end if;
    insert into public.tutor_modules(topic_id,owner_id,title) values(tid,uid,btrim(p->>'title')) returning id into mid;
    return jsonb_build_object('id',mid);
  end if;
  mid := (p->>'module_id')::uuid;
  if p_action = 'review' then
    select module_id into mid from public.tutor_attempts where id = (p->>'attempt_id')::uuid;
  end if;
  select * into m from public.tutor_modules where id = mid and owner_id = uid for update;
  if not found then raise exception 'Материал недоступен' using errcode = '42501'; end if;
  if p_action = 'module_save' then
    if m.revision is distinct from (p->>'revision')::integer then raise exception 'Модуль изменён в другой вкладке. Скопируйте изменения и обновите страницу'; end if;
    new_blocks := p->'blocks';
    if jsonb_typeof(new_blocks) <> 'array' or jsonb_array_length(new_blocks) > 200 then raise exception 'Неверный формат блоков'; end if;
    for item in select value from jsonb_array_elements(new_blocks) loop
      if coalesce(item->>'type','') not in ('heading','text','image','video','formula','table','code','example','practice','note') or item->>'id' is null then raise exception 'Неизвестный блок'; end if;
      if item->>'type' = 'practice' and not exists(select 1 from public.tutor_tasks where module_id = mid and id = (item->>'task_id')::uuid) then raise exception 'Задание блока не принадлежит модулю'; end if;
      if item->>'type' = 'image' and coalesce(item->>'path','') not like (mid::text || '/%') then raise exception 'Изображение не принадлежит модулю'; end if;
    end loop;
    if (select count(distinct value->>'id') from jsonb_array_elements(new_blocks)) <> jsonb_array_length(new_blocks) then raise exception 'Идентификаторы блоков повторяются'; end if;
    update public.tutor_modules set title = btrim(p->>'title'),description = coalesce(p->>'description',''),blocks = new_blocks,revision = revision+1,updated_at = now() where id = mid returning revision into n;
    return jsonb_build_object('revision',n);
  end if;
  if p_action = 'task_save' then
    tid := coalesce((p->>'id')::uuid,gen_random_uuid());
    if exists(select 1 from public.tutor_tasks where id = tid and module_id <> mid) then raise exception 'Задание недоступно' using errcode = '42501'; end if;
    if length(btrim(coalesce(p->>'statement',''))) = 0 then raise exception 'Добавьте условие'; end if;
    input_answer := p->'answer';
    if p->>'type' in ('single','multiple') then
      if jsonb_typeof(p->'options') <> 'array' or jsonb_array_length(p->'options') < 2 or jsonb_array_length(p->'options') > 20 then raise exception 'Добавьте от 2 до 20 вариантов'; end if;
      if exists(select 1 from jsonb_array_elements(p->'options') o where coalesce(o->>'id','') = '' or length(btrim(coalesce(o->>'label',''))) = 0) then raise exception 'Заполните варианты'; end if;
      if (select count(distinct o->>'id') from jsonb_array_elements(p->'options') o) <> jsonb_array_length(p->'options') then raise exception 'Варианты повторяются'; end if;
      if p->>'type' = 'single' and not exists(select 1 from jsonb_array_elements(p->'options') o where o->'id' = input_answer) then raise exception 'Укажите правильный вариант'; end if;
      if p->>'type' = 'multiple' then
        if jsonb_typeof(input_answer) <> 'array' or jsonb_array_length(input_answer) = 0 then raise exception 'Укажите правильные варианты'; end if;
        if exists(select 1 from jsonb_array_elements(input_answer) v where not exists(select 1 from jsonb_array_elements(p->'options') o where o->'id' = v)) then raise exception 'Неизвестный правильный вариант'; end if;
      end if;
    elsif p->>'type' = 'number' then
      if jsonb_typeof(input_answer) <> 'string' or (input_answer #>> '{}') !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' or length(input_answer #>> '{}') > 1000 then raise exception 'Правильный ответ должен быть точным числом'; end if;
    elsif p->>'type' = 'text' then
      if jsonb_typeof(input_answer) <> 'string' or length(btrim(input_answer #>> '{}')) = 0 then raise exception 'Укажите правильный ответ'; end if;
    elsif p->>'type' = 'manual' and length(btrim(coalesce(p->>'criteria',''))) = 0 then raise exception 'Укажите критерии ручной проверки'; end if;
    insert into public.tutor_tasks(id,module_id,type,title,statement,prototype,difficulty,options,position)
      values(tid,mid,p->>'type',btrim(p->>'title'),p->>'statement',coalesce(p->>'prototype',''),(p->>'difficulty')::integer,coalesce(p->'options','[]'),coalesce((p->>'position')::integer,0))
      on conflict(id) do update set type=excluded.type,title=excluded.title,statement=excluded.statement,prototype=excluded.prototype,difficulty=excluded.difficulty,options=excluded.options;
    insert into tutor_private.task_keys(task_id,answer,solution,common_mistakes,criteria,ignore_case,collapse_spaces,reveal)
      values(tid,coalesce(input_answer,'null'),coalesce(p->>'solution',''),coalesce(p->>'common_mistakes',''),coalesce(p->>'criteria',''),coalesce((p->>'ignore_case')::boolean,false),coalesce((p->>'collapse_spaces')::boolean,false),coalesce(p->>'reveal','after_attempt'))
      on conflict(task_id) do update set answer=excluded.answer,solution=excluded.solution,common_mistakes=excluded.common_mistakes,criteria=excluded.criteria,ignore_case=excluded.ignore_case,collapse_spaces=excluded.collapse_spaces,reveal=excluded.reveal;
    update public.tutor_modules set revision=revision+1,updated_at=now() where id=mid;
    return jsonb_build_object('id',tid);
  end if;
  if p_action = 'task_delete' then
    tid := (p->>'id')::uuid;
    -- Delete only drafts never published. Published history stays intact.
    if exists(select 1 from public.tutor_published_tasks where id=tid) then raise exception 'Опубликованное задание сохраняется для истории. Уберите его блок из модуля'; end if;
    if exists(select 1 from jsonb_array_elements(m.blocks) b where b->>'task_id'=tid::text) then raise exception 'Сначала удалите блок этого задания'; end if;
    delete from public.tutor_tasks where id=tid and module_id=mid;
    update public.tutor_modules set revision=revision+1,updated_at=now() where id=mid;
    return '{"deleted":true}';
  end if;
  if p_action = 'publish' then
    if m.revision is distinct from (p->>'revision')::integer then raise exception 'Черновик изменился. Обновите страницу'; end if;
    if jsonb_array_length(m.blocks)=0 then raise exception 'Добавьте хотя бы один блок'; end if;
    insert into public.tutor_publications(id,topic_id,owner_id,title,description,blocks,version)
      values(mid,m.topic_id,uid,m.title,m.description,m.blocks,m.revision)
      on conflict(id) do update set title=excluded.title,description=excluded.description,blocks=excluded.blocks,version=excluded.version,visible=true,published_at=now();
    update public.tutor_published_tasks set active=false where module_id=mid;
    for t in select x.* from public.tutor_tasks x where x.module_id=mid and exists(select 1 from jsonb_array_elements(m.blocks) b where b->>'type'='practice' and b->>'task_id'=x.id::text) loop
      insert into public.tutor_published_tasks(id,module_id,type,title,statement,prototype,difficulty,options,position,version)
        values(t.id,mid,t.type,t.title,t.statement,t.prototype,t.difficulty,t.options,t.position,m.revision)
        on conflict(id) do update set type=excluded.type,title=excluded.title,statement=excluded.statement,prototype=excluded.prototype,difficulty=excluded.difficulty,options=excluded.options,position=excluded.position,version=excluded.version,active=true;
      select * into k from tutor_private.task_keys where task_id=t.id;
      insert into tutor_private.published_keys values(t.id,k.answer,k.solution,k.common_mistakes,k.criteria,k.ignore_case,k.collapse_spaces,k.reveal)
        on conflict(task_id) do update set answer=excluded.answer,solution=excluded.solution,common_mistakes=excluded.common_mistakes,criteria=excluded.criteria,ignore_case=excluded.ignore_case,collapse_spaces=excluded.collapse_spaces,reveal=excluded.reveal;
    end loop;
    return '{"published":true}';
  end if;
  if p_action = 'unpublish' then
    update public.tutor_publications set visible=false where id=mid;
    return '{"unpublished":true}';
  end if;
  if p_action = 'review' then
    if p->>'status' not in ('correct','wrong') then raise exception 'Выберите результат'; end if;
    select * into a from public.tutor_attempts where id=(p->>'attempt_id')::uuid and status='pending' for update;
    if not found then raise exception 'Попытка уже проверена или недоступна'; end if;
    select * into pk from tutor_private.published_keys where task_id=a.task_id;
    v_feedback := jsonb_build_object('comment',coalesce(p->>'comment',''));
    if pk.reveal='after_attempt' or (pk.reveal='after_correct' and p->>'status'='correct') then v_feedback:=v_feedback||jsonb_build_object('solution',pk.solution,'common_mistakes',pk.common_mistakes); end if;
    update public.tutor_attempts set status=p->>'status',feedback=v_feedback,reviewed_at=now(),reviewer_id=uid where id=a.id;
    return '{"reviewed":true}';
  end if;
  raise exception 'Неизвестное действие';
end;
$$;
revoke all on function tutor_private.api(text,jsonb) from public, anon, authenticated;
grant execute on function tutor_private.api(text,jsonb) to authenticated;
create function public.tutor_api(p_action text, p jsonb default '{}') returns jsonb
language sql security invoker set search_path = '' as $$ select tutor_private.api(p_action,p); $$;
revoke all on function public.tutor_api(text,jsonb) from public, anon;
grant execute on function public.tutor_api(text,jsonb) to authenticated;

insert into public.tutor_sections(number,title,position)
select n,'Задание №' || n,n from generate_series(1,27) n;
notify pgrst, 'reload schema';
commit;
