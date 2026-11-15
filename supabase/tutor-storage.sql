begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tutor-images','tutor-images',false,8388608,array['image/png','image/jpeg','image/webp','image/gif']);
create policy tutor_images_upload on storage.objects for insert to authenticated with check (
  bucket_id='tutor-images' and (select tutor_private.is_teacher())
  and exists(select 1 from public.tutor_modules m where m.id::text=(storage.foldername(name))[1] and m.owner_id=(select auth.uid()))
  and lower(storage.extension(name)) in ('png','jpg','jpeg','webp','gif')
);
create policy tutor_images_read on storage.objects for select to authenticated using (
  bucket_id='tutor-images' and (
    exists(select 1 from public.tutor_modules m where m.id::text=(storage.foldername(name))[1] and m.owner_id=(select auth.uid()))
    or exists(select 1 from public.tutor_publications p, jsonb_array_elements(p.blocks) b where p.visible and b->>'type'='image' and b->>'path'=name)
  )
);
commit;

