-- Parhai Supabase schema
-- Run this in the Supabase SQL editor before enabling the app with real keys.

create type public.study_level as enum ('O_LEVEL', 'A_LEVEL');
create type public.paper_session as enum ('MAY_JUNE', 'OCT_NOV', 'FEB_MAR');
create type public.paper_type as enum ('PAST_PAPER', 'MARKING_SCHEME');
create type public.question_difficulty as enum ('EASY', 'MEDIUM', 'HARD');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  avatar_url text,
  level public.study_level,
  onboarded boolean not null default false,
  streak_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id bigserial primary key,
  name text not null,
  code text not null,
  level public.study_level not null,
  description text,
  color text not null default '#6D28D9',
  icon text not null default 'book',
  created_at timestamptz not null default now()
);

create unique index subjects_code_level_idx on public.subjects(code, level);

create table public.user_subjects (
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, subject_id)
);

create table public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

create table public.papers (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  title text not null,
  year integer not null,
  session public.paper_session not null,
  paper_number integer not null,
  type public.paper_type not null,
  variant integer,
  file_url text,
  created_at timestamptz not null default now()
);

create table public.notes (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  title text not null,
  topic text not null,
  content text,
  summary text,
  reading_time integer default 0,
  created_at timestamptz not null default now()
);

create table public.questions (
  id bigserial primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  topic text not null,
  difficulty public.question_difficulty not null default 'MEDIUM',
  question text not null,
  answer text,
  marking_points text[] default '{}',
  marks integer not null default 1,
  year integer,
  created_at timestamptz not null default now()
);

create table public.study_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.saved_questions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id bigint not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.user_subjects enable row level security;
alter table public.admin_users enable row level security;
alter table public.papers enable row level security;
alter table public.notes enable row level security;
alter table public.questions enable row level security;
alter table public.study_events enable row level security;
alter table public.saved_questions enable row level security;

create policy "Profiles are readable by owner" on public.profiles
  for select using (auth.uid() = id);

create policy "Profiles are writable by owner" on public.profiles
  for update using (auth.uid() = id);

create policy "Profiles can be inserted by owner" on public.profiles
  for insert with check (auth.uid() = id);

create policy "Subjects are readable by signed-in users" on public.subjects
  for select to authenticated using (true);

create policy "Papers are readable by signed-in users" on public.papers
  for select to authenticated using (true);

create policy "Notes are readable by signed-in users" on public.notes
  for select to authenticated using (true);

create policy "Questions are readable by signed-in users" on public.questions
  for select to authenticated using (true);

create policy "User subjects are readable by owner" on public.user_subjects
  for select using (auth.uid() = user_id);

create policy "User subjects are writable by owner" on public.user_subjects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Admin users can read own row" on public.admin_users
  for select to authenticated using (lower(email) = lower(auth.jwt() ->> 'email'));

create policy "Papers are manageable by admin users" on public.papers
  for all to authenticated
  using (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admin_users where lower(email) = lower(auth.jwt() ->> 'email')));

create policy "Study events are readable by owner" on public.study_events
  for select using (auth.uid() = user_id);

create policy "Study events are writable by owner" on public.study_events
  for insert with check (auth.uid() = user_id);

create policy "Saved questions are readable by owner" on public.saved_questions
  for select using (auth.uid() = user_id);

create policy "Saved questions are writable by owner" on public.saved_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
