-- Run in SQL Editor as the database owner. All fixture content is rolled back.
begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.tutor_roles where role='teacher' limit 1), true);
set local role authenticated;
do $$
declare d jsonb; section_id uuid; topic_id uuid; module_id uuid; task_id uuid; rev integer; attempt jsonb;
begin
  d:=public.tutor_api('data','{"preview":true}');
  if jsonb_array_length(d->'sections')<>27 then raise exception 'Expected 27 sections'; end if;
  section_id:=(d->'sections'->0->>'id')::uuid;
  topic_id:=(public.tutor_api('topic_save',jsonb_build_object('section_id',section_id,'title','__TRANSACTION_TEST__'))->>'id')::uuid;
  module_id:=(public.tutor_api('module_create',jsonb_build_object('topic_id',topic_id,'title','__TRANSACTION_TEST__'))->>'id')::uuid;
  task_id:=(public.tutor_api('task_save',jsonb_build_object('module_id',module_id,'type','number','title','__TRANSACTION_TEST__','statement','Test fixture, rolled back','difficulty',1,'answer','9007199254740993','reveal','after_correct'))->>'id')::uuid;
  select x.revision into rev from public.tutor_modules x where x.id=module_id;
  rev:=(public.tutor_api('module_save',jsonb_build_object('module_id',module_id,'revision',rev,'title','__TRANSACTION_TEST__','blocks',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type','practice','task_id',task_id))))->>'revision')::integer;
  if exists(select 1 from jsonb_array_elements(public.tutor_api('data','{"preview":true}')->'modules') x where x->>'id'=module_id::text) then raise exception 'Draft exposed'; end if;
  perform public.tutor_api('publish',jsonb_build_object('module_id',module_id,'revision',rev));
  d:=public.tutor_api('data','{"preview":true}');
  if exists(select 1 from jsonb_array_elements(d->'tasks') x where x->>'id'=task_id::text and (x ? 'answer' or x ? 'solution')) then raise exception 'Answer exposed'; end if;
  attempt:=public.tutor_api('attempt',jsonb_build_object('task_id',task_id,'version',rev,'answer','9007199254740992','preview',true,'request_id',gen_random_uuid()));
  if attempt->>'status'<>'wrong' or attempt->'feedback'<>'{}'::jsonb then raise exception 'Wrong grading/reveal'; end if;
  attempt:=public.tutor_api('attempt',jsonb_build_object('task_id',task_id,'version',rev,'answer','9007199254740993','preview',true,'request_id',gen_random_uuid()));
  if attempt->>'status'<>'correct' then raise exception 'Exact numeric grading failed'; end if;
  perform public.tutor_api('progress',jsonb_build_object('module_id',module_id,'preview',true,'complete',true));
  if not exists(select 1 from jsonb_array_elements(public.tutor_api('data','{"preview":true}')->'progress') x where x->>'module_id'=module_id::text and x->>'completed_at' is not null) then raise exception 'Progress not persisted'; end if;
  task_id:=(public.tutor_api('task_save',jsonb_build_object('module_id',module_id,'type','manual','title','__TRANSACTION_MANUAL_TEST__','statement','Manual fixture','difficulty',1,'criteria','Check test response','reveal','never'))->>'id')::uuid;
  select x.revision into rev from public.tutor_modules x where x.id=module_id;
  rev:=(public.tutor_api('module_save',jsonb_build_object('module_id',module_id,'revision',rev,'title','__TRANSACTION_TEST__','blocks',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'type','practice','task_id',task_id))))->>'revision')::integer;
  perform public.tutor_api('publish',jsonb_build_object('module_id',module_id,'revision',rev));
  attempt:=public.tutor_api('attempt',jsonb_build_object('task_id',task_id,'version',rev,'answer','Manual test response','preview',true,'request_id',gen_random_uuid()));
  if attempt->>'status'<>'pending' then raise exception 'Manual answer not queued'; end if;
  perform public.tutor_api('review',jsonb_build_object('attempt_id',attempt->>'id','status','correct','comment','Reviewed'));
  if not exists(select 1 from jsonb_array_elements(public.tutor_api('data','{"preview":true}')->'attempts') x where x->>'id'=attempt->>'id' and x->>'status'='correct' and x->'feedback'->>'comment'='Reviewed') then raise exception 'Manual review failed'; end if;
end $$;
rollback;
select 'PASS: live RPC, draft isolation, publication, exact grading, solution protection, progress, manual review; fixtures rolled back' as result;
