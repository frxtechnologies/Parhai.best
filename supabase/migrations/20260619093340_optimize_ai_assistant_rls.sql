drop policy if exists "Chat messages readable by owner" on public.chat_messages;
drop policy if exists "Chat messages insertable by owner" on public.chat_messages;
drop policy if exists "Chat messages deletable by owner" on public.chat_messages;

create policy "Chat messages readable by owner" on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Chat messages insertable by owner" on public.chat_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Chat messages deletable by owner" on public.chat_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
