-- Physics 0625 taxonomy system
-- Uses a new table `taxonomy_topics` to avoid collision with the existing
-- `topics` table (which has a bigserial PK and belongs to the legacy system).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. taxonomy_topics
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.taxonomy_topics (
  id           text primary key,              -- e.g. "phys.motion.kinematics" — never changes
  subject_code text not null,                 -- "0625" (IGCSE) or "5054" (O Level) when added
  parent_id    text references public.taxonomy_topics(id) on delete restrict,
  name         text not null,
  level        integer not null check (level in (1, 2)),
  keywords     text[] not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists taxonomy_topics_subject_code_idx on public.taxonomy_topics (subject_code);
create index if not exists taxonomy_topics_parent_id_idx    on public.taxonomy_topics (parent_id);

alter table public.taxonomy_topics enable row level security;

-- Admin can manage; anon/authenticated can only read
drop policy if exists "taxonomy_topics_read" on public.taxonomy_topics;
create policy "taxonomy_topics_read" on public.taxonomy_topics
  for select using (true);

drop policy if exists "taxonomy_topics_admin_write" on public.taxonomy_topics;
create policy "taxonomy_topics_admin_write" on public.taxonomy_topics
  for all using (
    exists (
      select 1 from public.admin_users au
      where au.email = (select email from auth.users where id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add taxonomy columns to question_index
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.question_index
  add column if not exists taxonomy_topic_id text references public.taxonomy_topics(id) on delete set null,
  add column if not exists taxonomy_confidence float;

create index if not exists question_index_taxonomy_topic_id_idx
  on public.question_index (taxonomy_topic_id)
  where taxonomy_topic_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed Cambridge IGCSE Physics 0625 taxonomy
-- ─────────────────────────────────────────────────────────────────────────────

-- Level 1: topic sections
insert into public.taxonomy_topics (id, subject_code, parent_id, level, name, keywords) values
  ('phys.motion',      '0625', null, 1, 'Motion, Forces and Energy',  array['motion','forces','energy','mechanics','work','power','momentum','pressure']),
  ('phys.thermal',     '0625', null, 1, 'Thermal Physics',             array['thermal','heat','temperature','kinetic','particle','conduction','convection','radiation','latent','specific heat']),
  ('phys.waves',       '0625', null, 1, 'Waves, Light and Sound',      array['wave','light','sound','reflection','refraction','diffraction','electromagnetic','lens','optics']),
  ('phys.electricity', '0625', null, 1, 'Electricity and Magnetism',   array['electricity','electric','circuit','current','voltage','resistance','magnet','magnetic','motor','generator','transformer']),
  ('phys.atomic',      '0625', null, 1, 'Atomic Physics',              array['atom','nuclear','radioactivity','radiation','proton','neutron','electron','isotope','half-life','decay'])
on conflict (id) do nothing;

-- Level 2: subtopics
insert into public.taxonomy_topics (id, subject_code, parent_id, level, name, keywords) values
  ('phys.motion.measurement', '0625', 'phys.motion', 2, 'Physical Quantities and Measurement',
    array['measurement','scalar','vector','SI units','significant figures','systematic error','random error','precision','accuracy','micrometer','vernier','stopwatch']),
  ('phys.motion.kinematics',  '0625', 'phys.motion', 2, 'Motion (Speed, Velocity and Acceleration)',
    array['speed','velocity','acceleration','distance','displacement','time','deceleration','uniform acceleration','distance-time graph','velocity-time graph','free fall','terminal velocity','equations of motion']),
  ('phys.motion.mass_weight', '0625', 'phys.motion', 2, 'Mass and Weight',
    array['mass','weight','gravitational field strength','g','inertia','newton','balance','spring balance','gravitational force']),
  ('phys.motion.density',     '0625', 'phys.motion', 2, 'Density',
    array['density','mass','volume','float','sink','Archimedes','upthrust','displacement method']),
  ('phys.motion.forces',      '0625', 'phys.motion', 2, 'Forces',
    array['force','resultant','Newton''s laws','friction','weight','normal reaction','free body diagram','equilibrium','turning effect','moment','torque','pivot','principle of moments','centre of gravity','stability']),
  ('phys.motion.momentum',    '0625', 'phys.motion', 2, 'Momentum',
    array['momentum','conservation of momentum','impulse','collision','explosion','Newton''s second law','elastic','inelastic']),
  ('phys.motion.energy',      '0625', 'phys.motion', 2, 'Energy, Work and Power',
    array['energy','work done','power','kinetic energy','potential energy','gravitational potential energy','conservation of energy','efficiency','renewable','non-renewable','joule','watt']),
  ('phys.motion.pressure',    '0625', 'phys.motion', 2, 'Pressure',
    array['pressure','pascal','force per unit area','hydraulic','atmospheric pressure','fluid pressure','manometer','barometer','depth']),

  ('phys.thermal.kinetic_model', '0625', 'phys.thermal', 2, 'Kinetic Particle Model of Matter',
    array['kinetic theory','particle model','solid','liquid','gas','states of matter','Brownian motion','diffusion','evaporation','boiling','melting','gas pressure','Boyle''s law','pressure law']),
  ('phys.thermal.properties',    '0625', 'phys.thermal', 2, 'Thermal Properties and Temperature',
    array['specific heat capacity','specific latent heat','latent heat of fusion','latent heat of vaporisation','thermal capacity','thermometer','temperature','Celsius','Kelvin','thermocouple','melting point','boiling point','heating curve','cooling curve']),
  ('phys.thermal.transfer',      '0625', 'phys.thermal', 2, 'Transfer of Thermal Energy',
    array['conduction','convection','radiation','thermal radiation','infrared','insulation','vacuum flask','conductor','insulator','convection current','black body','emitter','absorber']),

  ('phys.waves.general',     '0625', 'phys.waves', 2, 'General Wave Properties',
    array['wave','transverse','longitudinal','amplitude','wavelength','frequency','period','wave speed','crest','trough','compression','rarefaction','diffraction','interference','ripple tank']),
  ('phys.waves.light',       '0625', 'phys.waves', 2, 'Light',
    array['light','reflection','refraction','total internal reflection','critical angle','Snell''s law','refractive index','lens','converging lens','diverging lens','focal length','real image','virtual image','ray diagram','plane mirror','prism','optical fibre']),
  ('phys.waves.em_spectrum', '0625', 'phys.waves', 2, 'Electromagnetic Spectrum',
    array['electromagnetic spectrum','radio waves','microwaves','infrared','visible light','ultraviolet','X-rays','gamma rays','speed of light']),
  ('phys.waves.sound',       '0625', 'phys.waves', 2, 'Sound',
    array['sound','longitudinal wave','frequency','pitch','amplitude','loudness','echo','speed of sound','ultrasound','hearing range','oscilloscope']),

  ('phys.electricity.magnetism',     '0625', 'phys.electricity', 2, 'Simple Phenomena of Magnetism',
    array['magnet','magnetic field','field lines','north pole','south pole','attraction','repulsion','magnetisation','demagnetisation','electromagnet','solenoid','induced magnetism','hard','soft iron','steel']),
  ('phys.electricity.quantities',    '0625', 'phys.electricity', 2, 'Electrical Quantities',
    array['current','charge','potential difference','voltage','resistance','Ohm''s law','coulomb','ampere','volt','ohm','I-V characteristic','ohmic','thermistor','LDR','diode','filament lamp']),
  ('phys.electricity.circuits',      '0625', 'phys.electricity', 2, 'Electric Circuits',
    array['circuit','series','parallel','resistor','ammeter','voltmeter','switch','cell','battery','EMF','internal resistance','logic gate','AND','OR','NOT','NAND','NOR','truth table','relay','transistor','combined resistance']),
  ('phys.electricity.safety',        '0625', 'phys.electricity', 2, 'Electrical Safety',
    array['fuse','circuit breaker','earth wire','live wire','neutral wire','plug','three-pin plug','earthing','double insulation','mains electricity','hazard','overload','short circuit']),
  ('phys.electricity.electromagnetic','0625', 'phys.electricity', 2, 'Electromagnetic Effects',
    array['electromagnetic induction','Fleming''s left-hand rule','motor effect','force on current','generator','dynamo','AC','DC','alternating current','direct current','transformer','step-up','step-down','turn ratio','Faraday''s law','Lenz''s law']),

  ('phys.atomic.nuclear_atom',  '0625', 'phys.atomic', 2, 'The Nuclear Atom',
    array['atom','nucleus','proton','neutron','electron','proton number','nucleon number','atomic number','mass number','isotope','nuclide notation','shell','Rutherford','structure of atom']),
  ('phys.atomic.radioactivity', '0625', 'phys.atomic', 2, 'Radioactivity',
    array['radioactivity','alpha particle','beta particle','gamma ray','ionising radiation','half-life','decay','nuclear equation','penetrating power','Geiger-Müller tube','count rate','background radiation','safety precautions','radioactive dating','nuclear fission','nuclear fusion','chain reaction'])
on conflict (id) do nothing;
