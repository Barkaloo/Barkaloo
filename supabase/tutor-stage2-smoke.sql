-- Run as database owner after all Tutor migrations. No email is sent.
-- The temporary Auth users have no credentials; ALL changes are rolled back.
begin;
do $$
declare teacher uuid; student uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
begin
  select user_id into teacher from public.tutor_roles where role='teacher' order by user_id limit 1;
  if teacher is null then raise exception 'Create a Tutor teacher first'; end if;
  insert into auth.users(id,email) values(student,student::text||'@example.invalid'),(outsider,outsider::text||'@example.invalid');
  perform set_config('tutor.smoke.teacher',teacher::text,true);
  perform set_config('tutor.smoke.student',student::text,true);
  perform set_config('tutor.smoke.outsider',outsider::text,true);
end $$;
set local role authenticated;
do $$
declare teacher uuid:=current_setting('tutor.smoke.teacher')::uuid;
  student uuid:=current_setting('tutor.smoke.student')::uuid;
  outsider uuid:=current_setting('tutor.smoke.outsider')::uuid;
  d jsonb; invite jsonb; topic uuid; mid uuid; numeric_task uuid; manual_task uuid;
  rev integer; hid uuid; ni jsonb; mi jsonb; result jsonb; pending_id uuid;
begin
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  d:=public.tutor_api('data');
  invite:=public.tutor_api('invite_create','{"label":"__STAGE2_ROLLBACK_TEST__"}');
  if invite ? 'token_hash' then raise exception 'Invite hash exposed'; end if;
  perform set_config('request.jwt.claim.sub',student::text,true);
  perform public.tutor_api('student_join',jsonb_build_object('code',invite->>'code'));
  if jsonb_array_length(public.tutor_api('data')->'teachers')<>1 then raise exception 'Join failed'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  begin
    perform public.tutor_api('student_join',jsonb_build_object('code',invite->>'code'));
    raise exception 'Used invitation accepted';
  exception when others then
    if sqlerrm='Used invitation accepted' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform public.tutor_api('student_save',jsonb_build_object('student_id',student,'nickname','__STAGE2_TEST__','started_on','2026-11-01','status','active','notes','__PRIVATE_NOTE__'));
  topic:=(public.tutor_api('topic_save',jsonb_build_object('section_id',d->'sections'->0->>'id','title','__STAGE2_ROLLBACK_TEST__'))->>'id')::uuid;
  mid:=(public.tutor_api('module_create',jsonb_build_object('topic_id',topic,'title','__STAGE2_ROLLBACK_TEST__'))->>'id')::uuid;
  numeric_task:=(public.tutor_api('task_save',jsonb_build_object('module_id',mid,'type','number','title','__NUMBER__','statement','Technical fixture','difficulty',1,'answer','42','reveal','after_correct'))->>'id')::uuid;
  manual_task:=(public.tutor_api('task_save',jsonb_build_object('module_id',mid,'type','manual','title','__MANUAL__','statement','Technical fixture','difficulty',1,'criteria','__PRIVATE_CRITERIA__','reveal','never'))->>'id')::uuid;
  select revision into rev from public.tutor_modules where id=mid;
  rev:=(public.tutor_api('module_save',jsonb_build_object('module_id',mid,'revision',rev,'title','__STAGE2_ROLLBACK_TEST__','blocks',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type','practice','task_id',numeric_task),jsonb_build_object('id',gen_random_uuid(),'type','practice','task_id',manual_task))))->>'revision')::integer;
  perform public.tutor_api('publish',jsonb_build_object('module_id',mid,'revision',rev));
  perform public.tutor_api('module_access',jsonb_build_object('module_id',mid,'audience','assigned'));
  perform set_config('request.jwt.claim.sub',student::text,true);
  if exists(select 1 from public.tutor_publications where id=mid) then raise exception 'Unassigned module exposed'; end if;
  if exists(select 1 from public.tutor_student_notes) then raise exception 'Private notes exposed'; end if;
  begin
    perform tutor_private.api_v1('data','{}');
    raise exception 'Legacy API executable';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform public.tutor_api('module_assign',jsonb_build_object('module_id',mid,'student_id',student));
  hid:=(public.tutor_api('homework_create',jsonb_build_object('student_id',student,'title','__STAGE2_ROLLBACK_TEST__','due_at',now()+interval '1 day','task_ids',jsonb_build_array(numeric_task,manual_task)))->>'id')::uuid;
  perform public.tutor_api('lesson_save',jsonb_build_object('student_id',student,'starts_at',now(),'duration_minutes',60,'comment','__PRIVATE_LESSON__','topic_ids',jsonb_build_array(topic),'homework_ids',jsonb_build_array(hid)));
  perform set_config('request.jwt.claim.sub',student::text,true);
  if not exists(select 1 from public.tutor_publications where id=mid) then raise exception 'Assignment missing'; end if;
  if exists(select 1 from public.tutor_lessons) then raise exception 'Private lessons exposed'; end if;
  select to_jsonb(i) into ni from public.tutor_homework_items i where homework_id=hid and task_id=numeric_task;
  select to_jsonb(i) into mi from public.tutor_homework_items i where homework_id=hid and task_id=manual_task;
  if ni is null or mi is null or mi->'snapshot' ? 'criteria' then raise exception 'Homework snapshot invalid'; end if;
  result:=public.tutor_api('attempt',jsonb_build_object('task_id',numeric_task,'homework_item_id',ni->>'id','version',rev,'answer','41','request_id',gen_random_uuid()));
  if result->>'status'<>'wrong' or result->'feedback'<>'{}'::jsonb then raise exception 'Wrong grading/reveal'; end if;
  result:=public.tutor_api('attempt',jsonb_build_object('task_id',manual_task,'homework_item_id',mi->>'id','version',rev,'answer','Technical response','request_id',gen_random_uuid()));
  if result->>'status'<>'pending' then raise exception 'Manual queue failed'; end if;
  pending_id:=(result->>'id')::uuid;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if exists(select 1 from public.tutor_homework where id=hid) or exists(select 1 from public.tutor_homework_items where homework_id=hid) or exists(select 1 from public.tutor_attempts where module_id=mid) then raise exception 'Student isolation failed'; end if;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  if not exists(select 1 from jsonb_array_elements(public.tutor_api('data')->'review_queue') a where a->>'id'=pending_id::text and a->>'criteria'='__PRIVATE_CRITERIA__') then raise exception 'Teacher criteria missing'; end if;
  perform public.tutor_api('review',jsonb_build_object('attempt_id',pending_id,'status','correct','comment','Reviewed'));
  perform public.tutor_api('unpublish',jsonb_build_object('module_id',mid));
  perform set_config('request.jwt.claim.sub',student::text,true);
  result:=public.tutor_api('attempt',jsonb_build_object('task_id',numeric_task,'homework_item_id',ni->>'id','version',rev,'answer','42','request_id',gen_random_uuid()));
  if result->>'status'<>'correct' then raise exception 'Homework snapshot after unpublish failed'; end if;
  if (select a->>'id' from jsonb_array_elements(public.tutor_api('data')->'attempts') with ordinality x(a,n) where a->>'task_id'=numeric_task::text order by n limit 1) is distinct from result->>'id' then raise exception 'Latest answer order failed'; end if;
  if (select count(*) from public.tutor_attempts where module_id=mid)<>3 then raise exception 'Attempt history lost'; end if;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  perform public.tutor_api('homework_cancel',jsonb_build_object('id',hid));
  perform set_config('request.jwt.claim.sub',student::text,true);
  begin
    perform public.tutor_api('attempt',jsonb_build_object('task_id',numeric_task,'homework_item_id',ni->>'id','version',rev,'answer','42','request_id',gen_random_uuid()));
    raise exception 'Canceled homework accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: live Stage 2 RPC, invitations, assignments, homework snapshots, review, lessons, isolation; all fixtures rolled back' as result;
