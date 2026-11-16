-- Permanent student credentials. All existing accounts and English/Fit stay intact.
begin;
alter table public.tutor_profiles add column onboarding_complete boolean not null default true;
create table tutor_private.code_config (
  singleton boolean primary key default true check(singleton),
  secret text not null
);
insert into tutor_private.code_config(secret) values(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
create table tutor_private.code_requests (
  id uuid primary key,teacher_id uuid not null references auth.users(id),
  student_id uuid unique not null default gen_random_uuid(),created_at timestamptz not null default clock_timestamp()
);
-- Retired hashes stay reserved: an old credential must never open a different account.
create table tutor_private.code_history (
  code_hash text primary key check(code_hash ~ '^[0-9a-f]{64}$'),
  student_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default clock_timestamp()
);
create index tutor_code_history_student_idx on tutor_private.code_history(student_id);
create table tutor_private.student_codes (
  student_id uuid primary key references auth.users(id),teacher_id uuid not null,
  code_hash text unique not null references tutor_private.code_history(code_hash),
  ciphertext text not null check(length(ciphertext) between 20 and 500),
  version integer not null default 1,enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),created_at timestamptz not null default clock_timestamp(),
  foreign key(teacher_id,student_id) references public.tutor_student_links(teacher_id,student_id)
);
create index tutor_student_codes_teacher_idx on tutor_private.student_codes(teacher_id);
create table tutor_private.code_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  student_id uuid not null references tutor_private.student_codes(student_id),version integer not null
);
create index tutor_code_sessions_student_idx on tutor_private.code_sessions(student_id);
create table tutor_private.code_limits (
  bucket text primary key,window_start timestamptz not null,hits integer not null
);
do $$ declare t text; begin
  foreach t in array array['code_config','code_requests','code_history','student_codes','code_sessions','code_limits'] loop
    execute format('alter table tutor_private.%I enable row level security',t);
    execute format('revoke all on tutor_private.%I from public,anon,authenticated,service_role',t);
  end loop;
end $$;

-- Only sessions registered by the code gateway may use managed student accounts.
-- Refreshing an old session cannot upgrade its credential generation.
create function tutor_private.code_session_active() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users where id=auth.uid()) and (
    not exists(select 1 from tutor_private.student_codes where student_id=auth.uid()) or exists(
      select 1 from tutor_private.student_codes c
      join public.tutor_student_links l using(teacher_id,student_id)
      join tutor_private.code_sessions cs on cs.student_id=c.student_id and cs.version=c.version
      join auth.sessions s on s.id=cs.session_id and s.user_id=c.student_id
      where c.student_id=auth.uid() and c.enabled and l.status='active'
        and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now())
    )
  );
$$;
revoke all on function tutor_private.code_session_active() from public,anon;
grant execute on function tutor_private.code_session_active() to authenticated;
do $$ declare t text; begin
  foreach t in array array['tutor_profiles','tutor_roles','tutor_sections','tutor_topics','tutor_modules','tutor_tasks','tutor_publications','tutor_published_tasks','tutor_attempts','tutor_progress','tutor_student_links','tutor_student_notes','tutor_module_assignments','tutor_homework','tutor_homework_items','tutor_lessons','tutor_lesson_topics','tutor_lesson_homework'] loop
    execute format('create policy tutor_code_session on public.%I as restrictive for select to authenticated using((select tutor_private.code_session_active()))',t);
  end loop;
end $$;

create function tutor_private.take_code_limit(p_bucket text,p_max integer,p_seconds integer) returns integer
language plpgsql security invoker set search_path='' as $$
declare started timestamptz; n integer; at_time timestamptz:=clock_timestamp();
begin
  insert into tutor_private.code_limits values(p_bucket,at_time,0) on conflict do nothing;
  select window_start,hits into started,n from tutor_private.code_limits where bucket=p_bucket for update;
  if started+make_interval(secs=>p_seconds)<=at_time then started:=at_time;n:=0;end if;
  if n>=p_max then return greatest(1,ceil(extract(epoch from started+make_interval(secs=>p_seconds)-at_time))::integer);end if;
  update tutor_private.code_limits set window_start=started,hits=n+1 where bucket=p_bucket;
  return 0;
end $$;
revoke all on function tutor_private.take_code_limit(text,integer,integer) from public,anon,authenticated,service_role;

-- Only the Edge Function's built-in service credential can call this gateway.
-- Teacher identity is verified with Auth.getUser before it is passed here.
create function public.tutor_code_gateway(p_action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=(p->>'actor_id')::uuid; sid uuid:=(p->>'student_id')::uuid;
  request tutor_private.code_requests; c tutor_private.student_codes;
  wait_seconds integer; limit_seconds integer; inserted text;
begin
  if pg_column_size(p)>8192 then raise exception 'Слишком большой запрос';end if;
  if p_action='config' then return jsonb_build_object('secret',(select secret from tutor_private.code_config));end if;
  if p_action='login' then
    if coalesce(p->>'code_hash','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'network_hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Invalid credential hash';end if;
    -- Global ceiling is independent of forwarded headers. Invalid attempts commit
    -- these counters too; no exception rolls them back and no success resets them.
    wait_seconds:=tutor_private.take_code_limit('global',60,3600);
    limit_seconds:=tutor_private.take_code_limit('network:'||(p->>'network_hash'),5,900);
    wait_seconds:=greatest(wait_seconds,limit_seconds);
    limit_seconds:=tutor_private.take_code_limit('code:'||(p->>'code_hash'),5,900);
    wait_seconds:=greatest(wait_seconds,limit_seconds);
    delete from tutor_private.code_limits where window_start<clock_timestamp()-interval '2 days';
    if wait_seconds>0 then return jsonb_build_object('allowed',false,'retry_after',wait_seconds);end if;
    select sc.* into c from tutor_private.student_codes sc join public.tutor_student_links l using(teacher_id,student_id)
      where sc.code_hash=p->>'code_hash' and sc.enabled and l.status='active';
    if not found then return '{"allowed":false}';end if;
    return jsonb_build_object('allowed',true,'student_id',c.student_id,'version',c.version);
  end if;
  if p_action='confirm' then
    if not exists(select 1 from tutor_private.student_codes sc join public.tutor_student_links l using(teacher_id,student_id)
      join auth.sessions s on s.user_id=sc.student_id where sc.student_id=sid and sc.code_hash=p->>'code_hash' and sc.version=(p->>'version')::integer
      and sc.enabled and l.status='active' and s.id::text=p->>'session_id') then return '{"allowed":false}';end if;
    insert into tutor_private.code_sessions(session_id,student_id,version) values((p->>'session_id')::uuid,sid,(p->>'version')::integer) on conflict do nothing;
    return jsonb_build_object('allowed',exists(select 1 from tutor_private.code_sessions where session_id=(p->>'session_id')::uuid and student_id=sid and version=(p->>'version')::integer));
  end if;
  if not exists(select 1 from public.tutor_roles where user_id=actor and role='teacher') then raise exception 'Требуется роль преподавателя' using errcode='42501';end if;
  if p_action='prepare' then
    insert into tutor_private.code_requests(id,teacher_id) values((p->>'request_id')::uuid,actor) on conflict do nothing;
    select * into request from tutor_private.code_requests where id=(p->>'request_id')::uuid for update;
    if request.teacher_id<>actor then raise exception 'Запрос недоступен' using errcode='42501';end if;
    select * into c from tutor_private.student_codes where student_id=request.student_id;
    return jsonb_build_object('student_id',request.student_id,'ciphertext',c.ciphertext,'version',c.version,'enabled',c.enabled);
  end if;
  if p_action='finish' then
    select * into request from tutor_private.code_requests where id=(p->>'request_id')::uuid for update;
    if not found or request.teacher_id<>actor or request.student_id<>sid then raise exception 'Запрос недоступен' using errcode='42501';end if;
    select * into c from tutor_private.student_codes where student_id=sid;
    if found then return jsonb_build_object('student_id',sid,'ciphertext',c.ciphertext,'version',c.version,'enabled',c.enabled);end if;
    if not exists(select 1 from auth.users where id=sid) or exists(select 1 from public.tutor_roles where user_id=sid and role='teacher') then raise exception 'Аккаунт недоступен';end if;
    insert into tutor_private.code_history(code_hash,student_id) values(p->>'code_hash',sid) on conflict do nothing returning code_hash into inserted;
    if inserted is null then return '{"collision":true}';end if;
    insert into public.tutor_student_links(teacher_id,student_id,nickname) values(actor,sid,btrim(coalesce(p->>'nickname','')));
    insert into public.tutor_profiles(user_id,display_name,onboarding_complete) values(sid,'Новый ученик',false)
      on conflict(user_id) do update set onboarding_complete=false;
    insert into tutor_private.student_codes(student_id,teacher_id,code_hash,ciphertext) values(sid,actor,p->>'code_hash',p->>'ciphertext') returning * into c;
    return jsonb_build_object('student_id',sid,'ciphertext',c.ciphertext,'version',c.version,'enabled',c.enabled);
  end if;
  select * into c from tutor_private.student_codes where student_id=sid and teacher_id=actor for update;
  if not found then raise exception 'Ученик недоступен' using errcode='42501';end if;
  if p_action='show' then null;
  elsif p_action='rotate' then
    if c.version is distinct from (p->>'version')::integer then raise exception 'Код уже изменён. Откройте карточку заново';end if;
    insert into tutor_private.code_history(code_hash,student_id) values(p->>'code_hash',sid) on conflict do nothing returning code_hash into inserted;
    if inserted is null then return '{"collision":true}';end if;
    update tutor_private.student_codes set code_hash=p->>'code_hash',ciphertext=p->>'ciphertext',version=version+1,updated_at=clock_timestamp() where student_id=sid returning * into c;
  elsif p_action='enabled' then
    update tutor_private.student_codes set enabled=(p->>'enabled')::boolean,version=version+1,updated_at=clock_timestamp() where student_id=sid returning * into c;
  else raise exception 'Неизвестное действие';end if;
  return jsonb_build_object('student_id',sid,'ciphertext',c.ciphertext,'version',c.version,'enabled',c.enabled);
end $$;
revoke all on function public.tutor_code_gateway(text,jsonb) from public,anon,authenticated;
grant execute on function public.tutor_code_gateway(text,jsonb) to service_role;

alter function tutor_private.api(text,jsonb) rename to api_v2;
revoke all on function tutor_private.api_v2(text,jsonb) from public,anon,authenticated;
create function tutor_private.api(p_action text,p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Требуется вход в аккаунт' using errcode='42501';end if;
  if not tutor_private.code_session_active() then raise exception 'Доступ закрыт или код обновлён. Войдите заново по коду преподавателя' using errcode='42501';end if;
  if p_action='student_setup' then
    if not exists(select 1 from tutor_private.student_codes where student_id=uid) then raise exception 'Аккаунт недоступен' using errcode='42501';end if;
    if length(btrim(coalesce(p->>'display_name',''))) not between 2 and 60 then raise exception 'Ник должен содержать от 2 до 60 символов';end if;
    if coalesce(p->>'theme','system') not in ('system','light','dark') then raise exception 'Выберите оформление';end if;
    update public.tutor_profiles set display_name=btrim(p->>'display_name'),theme=coalesce(p->>'theme','system'),onboarding_complete=true where user_id=uid;
    return '{"saved":true}';
  end if;
  result:=tutor_private.api_v2(p_action,p);
  if p_action='student_save' and p->>'status'='archived' then
    update tutor_private.student_codes set version=version+1,updated_at=clock_timestamp() where teacher_id=uid and student_id=(p->>'student_id')::uuid;
  end if;
  if p_action='data' then
    result:=result||jsonb_build_object('students',coalesce((select jsonb_agg(s||jsonb_build_object('login_method',case when c.student_id is null then 'email' else 'code' end,'code_enabled',c.enabled))
      from jsonb_array_elements(result->'students') s left join tutor_private.student_codes c on c.student_id=(s->>'student_id')::uuid and c.teacher_id=uid),'[]'::jsonb));
  end if;
  return result;
end $$;
revoke all on function tutor_private.api(text,jsonb) from public,anon;
grant execute on function tutor_private.api(text,jsonb) to authenticated;
create or replace function public.tutor_api(p_action text,p jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select tutor_private.api(p_action,p); $$;
revoke all on function public.tutor_api(text,jsonb) from public,anon;
grant execute on function public.tutor_api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
