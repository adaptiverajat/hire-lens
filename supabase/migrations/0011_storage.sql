-- HireLens :: 0011 :: Supabase Storage buckets for uploaded documents
-- Private buckets; the app serves files via short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'job-descriptions',
    'job-descriptions',
    false,
    10485760, -- 10 MB
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ]
  ),
  (
    'resumes',
    'resumes',
    false,
    10485760,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ]
  ),
  (
    'transcripts',
    'transcripts',
    false,
    20971520, -- 20 MB
    array[
      'text/plain',
      'text/vtt',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/json'
    ]
  )
on conflict (id) do nothing;

-- Users may only touch objects under a folder named after their user id.
-- Path convention: <bucket>/<user_id>/<job_id>/<filename>

drop policy if exists hirelens_job_descriptions_own on storage.objects;
create policy hirelens_job_descriptions_own on storage.objects
  for all
  using (bucket_id = 'job-descriptions' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'job-descriptions' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists hirelens_resumes_own on storage.objects;
create policy hirelens_resumes_own on storage.objects
  for all
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists hirelens_transcripts_own on storage.objects;
create policy hirelens_transcripts_own on storage.objects
  for all
  using (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'transcripts' and (storage.foldername(name))[1] = auth.uid()::text);
