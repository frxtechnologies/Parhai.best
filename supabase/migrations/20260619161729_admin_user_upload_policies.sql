-- Allow the authenticated content administrators to run the ingestion pipeline
-- with their own JWT. This keeps the service-role key out of local development.

create policy "Marking schemes manageable by admin users"
  on public.marking_schemes for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Questions manageable by admin users"
  on public.questions for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Topics manageable by admin users"
  on public.topics for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Question topics manageable by admin users"
  on public.question_topics for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Document chunks manageable by admin users"
  on public.document_chunks for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

grant select, insert, update, delete on
  public.papers,
  public.marking_schemes,
  public.questions,
  public.topics,
  public.question_topics,
  public.document_chunks
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
