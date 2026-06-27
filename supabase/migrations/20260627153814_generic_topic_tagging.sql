create table if not exists public.topic_maps (
  id bigserial primary key,
  subject_code text not null references public.subject_code_map(subject_code) on delete cascade,
  topic text not null,
  subtopic text not null default '',
  syllabus_reference text,
  keywords text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  source text not null default 'manual' check (source in ('manual','csv','ai_syllabus')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_code, topic, subtopic)
);

alter table public.question_index
  add column if not exists syllabus_reference text,
  add column if not exists confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  add column if not exists needs_review boolean not null default false,
  add column if not exists tagging_method text check (tagging_method is null or tagging_method in ('keyword','ai','manual','missing_map')),
  add column if not exists tagging_note text;

create index if not exists topic_maps_subject_status_idx on public.topic_maps(subject_code, status, topic);
create index if not exists topic_maps_keywords_idx on public.topic_maps using gin(keywords);
create index if not exists question_index_review_idx on public.question_index(subject_id, needs_review) where needs_review;

alter table public.topic_maps enable row level security;
create policy "Approved topic maps readable by signed-in users"
  on public.topic_maps for select to authenticated
  using (status = 'approved' or exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));
create policy "Topic maps manageable by admins"
  on public.topic_maps for all to authenticated
  using (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')))
  with check (exists(select 1 from public.admin_users where lower(email)=lower(auth.jwt()->>'email')));
grant select,insert,update,delete on public.topic_maps to authenticated;
grant usage,select on sequence public.topic_maps_id_seq to authenticated;

insert into public.topic_maps(subject_code, topic, keywords, status, source) values
('5054','Motion',array['speed','velocity','acceleration','distance-time','velocity-time','motion','deceleration'],'approved','manual'),
('5054','Forces',array['force','newton','moment','equilibrium','pressure','density','weight','mass','friction'],'approved','manual'),
('5054','Energy',array['energy','work done','power','efficiency','kinetic','potential energy','conservation of energy'],'approved','manual'),
('5054','Matter',array['particle','density','solid','liquid','gas','brownian','molecule','pressure'],'approved','manual'),
('5054','Thermal Physics',array['temperature','thermal','heat','conduction','convection','radiation','specific heat','latent heat','expansion'],'approved','manual'),
('5054','Waves',array['wave','wavelength','frequency','amplitude','diffraction','transverse','longitudinal'],'approved','manual'),
('5054','Light',array['reflection','refraction','lens','ray diagram','focal length','image','mirror','prism','dispersion','critical angle','total internal reflection'],'approved','manual'),
('5054','Sound',array['sound','echo','ultrasound','pitch','loudness','microphone','frequency'],'approved','manual'),
('5054','Electricity',array['current','voltage','resistance','circuit','series','parallel','power','energy','charge','ammeter','voltmeter','resistor','fuse'],'approved','manual'),
('5054','Magnetism',array['magnet','magnetic field','pole','compass','induced magnetism'],'approved','manual'),
('5054','Electromagnetism',array['electromagnet','motor','generator','transformer','electromagnetic induction','solenoid','relay'],'approved','manual'),
('5054','Atomic Physics',array['radioactive','radiation','alpha','beta','gamma','half-life','nucleus','isotope','atom'],'approved','manual'),
('5054','Space Physics',array['planet','star','galaxy','universe','orbit','satellite','redshift','solar system'],'approved','manual')
on conflict(subject_code,topic,subtopic) do update set keywords=excluded.keywords,status='approved',updated_at=now();
