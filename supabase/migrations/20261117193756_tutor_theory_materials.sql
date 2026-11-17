begin;
create table public.tutor_theory_materials (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 section_id uuid not null references public.tutor_sections(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 description text not null default '' check(length(description)<=5000),
 path text unique, filename text, mime_type text, video_url text,
 archived boolean not null default false, created_at timestamptz not null default now(),
 check (num_nonnulls(path,video_url)=1),
 check ((path is not null and filename is not null and video_url is null and
   path like owner_id::text||'/'||id::text||'/%' and
   path ~ '\.(pdf|txt|csv|py|zip|docx|xlsx|pptx|png|jpg|jpeg|webp|gif|mp4|webm|mp3|wav|ogg)$') or
   (path is null and video_url ~ '^https://(www\.)?(youtube\.com/watch\?|youtu\.be/|vimeo\.com/)[^[:space:]]+$'))
);
create index tutor_theory_owner_section_idx on public.tutor_theory_materials(owner_id,section_id,created_at desc);
alter table public.tutor_theory_materials enable row level security;
create function tutor_private.can_read_theory(owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and tutor_private.code_session_active() and
 ((owner=auth.uid() and tutor_private.is_teacher()) or exists(
 select 1 from public.tutor_student_links l where l.teacher_id=owner and l.student_id=auth.uid() and l.status='active'));
$$;
revoke all on function tutor_private.can_read_theory(uuid) from public,anon;
grant execute on function tutor_private.can_read_theory(uuid) to authenticated;
revoke all on public.tutor_theory_materials from public,anon,authenticated;
grant select,insert on public.tutor_theory_materials to authenticated;
grant update(title,description,archived) on public.tutor_theory_materials to authenticated;
create policy tutor_theory_read on public.tutor_theory_materials for select to authenticated
 using(tutor_private.can_read_theory(owner_id) and (not archived or owner_id=(select auth.uid())));
create policy tutor_theory_add on public.tutor_theory_materials for insert to authenticated
 with check(owner_id=(select auth.uid()) and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active()));
create policy tutor_theory_edit on public.tutor_theory_materials for update to authenticated
 using(owner_id=(select auth.uid()) and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active()))
 with check(owner_id=(select auth.uid()) and (select tutor_private.is_teacher()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tutor-theory','tutor-theory',false,52428800,array['application/pdf','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/wav','audio/ogg']);
create policy tutor_theory_upload on storage.objects for insert to authenticated with check(
 bucket_id='tutor-theory' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active())
 and lower(storage.extension(name)) in ('pdf','txt','csv','py','zip','docx','xlsx','pptx','png','jpg','jpeg','webp','gif','mp4','webm','mp3','wav','ogg'));
create policy tutor_theory_files_read on storage.objects for select to authenticated using(
 bucket_id='tutor-theory' and (exists(select 1 from public.tutor_theory_materials m
 where m.path=name and not m.archived and tutor_private.can_read_theory(m.owner_id)) or
 ((storage.foldername(name))[1]=(select auth.uid())::text and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active()))));
create policy tutor_theory_cleanup on storage.objects for delete to authenticated using(
 bucket_id='tutor-theory' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select tutor_private.is_teacher()) and (select tutor_private.code_session_active())
 and not exists(select 1 from public.tutor_theory_materials m where m.path=name));
notify pgrst,'reload schema';
commit;
