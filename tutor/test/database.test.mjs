import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

test('Real PostgreSQL: publishing, grading, isolation, history and preview', async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz default clock_timestamp(),not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
    create function storage.extension(name text) returns text language sql as $$ select (string_to_array(name,'.'))[array_length(string_to_array(name,'.'),1)] $$;
  `);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(file,migrations),'utf8'));
  const teacher=randomUUID(), student=randomUUID(), other=randomUUID();
  for (const [id,email] of [[teacher,'teacher@test.invalid'],[student,'student@test.invalid'],[other,'other@test.invalid']]) {
    await db.query('insert into auth.users values($1,$2)',[id,email]);
  }
  await db.query("insert into tutor_roles values($1,'teacher')",[teacher]);
  const as = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']); await db.exec('set role authenticated'); };
  const api = async(action,p={}) => (await db.query('select tutor_api($1,$2::jsonb) as value',[action,JSON.stringify(p)])).rows[0].value;
  await as(teacher);
  const data=await api('data'); assert.equal(data.sections.length,27);
  const topic=await api('topic_save',{section_id:data.sections[0].id,title:'Integration fixture',description:''});
  const module=await api('module_create',{topic_id:topic.id,title:'Fixture module'});
  await db.query("insert into storage.objects(bucket_id,name) values('tutor-images',$1)",[`${module.id}/${randomUUID()}.png`]);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('tutor-images',$1)",[`${module.id}/${randomUUID()}.svg`]),/row-level security/);
  const task=await api('task_save',{module_id:module.id,title:'Fixture task',statement:'Test only',type:'number',difficulty:1,answer:'9007199254740993',reveal:'after_correct'});
  let draft=(await api('data')).modules[0];
  const blocks=[{id:randomUUID(),type:'heading',text:'Fixture'},{id:randomUUID(),type:'practice',task_id:task.id}];
  await api('module_save',{module_id:module.id,revision:draft.revision,title:draft.title,blocks});
  await as(student);
  assert.equal((await api('data')).modules.length,0);
  assert.equal((await db.query('select * from tutor_modules')).rows.length,0);
  assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('tutor-images',$1)",[`${module.id}/${randomUUID()}.png`]),/row-level security/);
  await assert.rejects(api('module_create',{topic_id:topic.id,title:'Hacked'}),/преподавателя/);
  await assert.rejects(db.query('insert into tutor_roles values($1,$2)',[student,'teacher']),/permission denied/);
  await assert.rejects(db.query('select * from tutor_private.task_keys'),/permission denied/);
  await as(teacher); draft=(await api('data')).modules[0];
  await api('publish',{module_id:module.id,revision:draft.revision});
  await as(student); let published=(await api('data')).tasks[0];
  assert.equal(published.answer,undefined); assert.equal(published.solution,undefined);
  const submit=async(answer,extra={})=>api('attempt',{task_id:task.id,version:published.version,answer,request_id:randomUUID(),...extra});
  const wrong=await submit('9007199254740992'); assert.equal(wrong.status,'wrong'); assert.deepEqual(wrong.feedback,{});
  const correct=await submit('9007199254740993'); assert.equal(correct.status,'correct'); assert.equal(correct.feedback.answer,'9007199254740993');
  assert.equal((await submit('9007199254740993',{request_id:correct.request_id})).id,correct.id);
  assert.equal((await api('data')).attempts.length,2);
  await assert.rejects(submit('9007199254740993',{preview:true}),/преподавателю/);
  await assert.rejects(submit('1',{version:0}),/обновилось/);
  await assert.rejects(db.exec("update tutor_attempts set status='correct'"),/permission denied/);
  await api('progress',{module_id:module.id,complete:true,last_block_id:blocks[1].id});
  assert.equal((await api('data')).progress.length,1);
  await as(other); assert.equal((await api('data')).attempts.length,0); assert.equal((await db.query('select * from tutor_attempts')).rows.length,0);
  await as(teacher);
  await api('attempt',{task_id:task.id,version:published.version,answer:'0',request_id:randomUUID(),preview:true});
  assert.equal((await api('data',{preview:true})).attempts.length,1);
  assert.equal((await api('data')).attempts.length,2);
  await api('task_save',{module_id:module.id,id:task.id,title:'Draft edit',statement:'Changed',type:'number',difficulty:1,answer:'2',reveal:'never'});
  await as(student); assert.equal((await api('data')).tasks[0].title,'Fixture task');
  assert.equal((await submit('9007199254740993')).status,'correct');
  await as(teacher); await api('unpublish',{module_id:module.id});
  await as(student); assert.equal((await api('data')).modules.length,0);
  await assert.rejects(submit('1'),/недоступно/);
  assert.equal((await api('data')).attempts.length,3);
  await as(teacher);
  const fixtures=[
    {type:'text',answer:'Python Tutor',ignore_case:true,collapse_spaces:true,correct:'  PYTHON   tutor ',wrong:'python'},
    {type:'single',answer:'b',options:[{id:'a',label:'A'},{id:'b',label:'B'}],correct:'b',wrong:'a'},
    {type:'multiple',answer:['a','c'],options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],correct:['c','a'],wrong:['a']},
    {type:'manual',answer:'',criteria:'Fixture review criteria',correct:'Solution to review'},
  ];
  for(const f of fixtures){
    const {id}=await api('task_save',{module_id:module.id,title:`Fixture ${f.type}`,statement:'Automated test only',difficulty:1,reveal:'never',...f});f.id=id;
  }
  draft=(await api('data')).modules[0];
  const newRevision=await api('module_save',{module_id:module.id,revision:draft.revision,title:draft.title,blocks:fixtures.map(f=>({id:randomUUID(),type:'practice',task_id:f.id}))});
  await assert.rejects(api('module_save',{module_id:module.id,revision:0,title:draft.title,blocks:[]}),/другой вкладке/);
  await api('publish',{module_id:module.id,revision:newRevision.revision});
  await as(student);
  const live=(await api('data')).tasks;
  for(const f of fixtures){
    const t=live.find(t=>t.id===f.id);assert.equal(t.answer,undefined);
    const run=(answer)=>api('attempt',{task_id:f.id,version:t.version,answer,request_id:randomUUID()});
    const correct=await run(f.correct);assert.equal(correct.status,f.type==='manual'?'pending':'correct');assert.deepEqual(correct.feedback,{});
    if(f.wrong!==undefined)assert.equal((await run(f.wrong)).status,'wrong');
    if(f.type==='multiple')await assert.rejects(run(['a','a','c']),/Повтор/);
    if(f.type==='single')await assert.rejects(run('unknown'),/Выберите/);
    if(f.type==='manual'){
      await assert.rejects(api('review',{attempt_id:correct.id,status:'correct'}),/преподавателя/);
      await as(teacher);assert.ok((await api('data')).review_queue.some(a=>a.id===correct.id));
      await api('review',{attempt_id:correct.id,status:'correct',comment:'Reviewed fixture'});
      await assert.rejects(api('review',{attempt_id:correct.id,status:'wrong'}),/уже проверена/);
      await as(student);const reviewed=(await api('data')).attempts.find(a=>a.id===correct.id);assert.equal(reviewed.status,'correct');assert.equal(reviewed.feedback.comment,'Reviewed fixture');
    }
  }
  await as(null); await assert.rejects(api('data'),/Требуется вход/);
  await db.close();
});
