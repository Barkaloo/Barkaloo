begin;
create or replace function tutor_private.api(p_action text, p jsonb default '{}') returns jsonb
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

notify pgrst, 'reload schema';
commit;
