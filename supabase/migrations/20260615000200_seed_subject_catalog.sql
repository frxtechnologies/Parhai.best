-- O Level subject catalog for Parhai.
-- This keeps the platform catalog aligned with the subjects offered in the app.

delete from public.subjects
where level = 'O_LEVEL'
  and code not in ('1123', '2058', '2059', '4024', '5054', '5070', '5090', '2210', '403', '2281', '7100');

insert into public.subjects (name, code, level, description, color, icon) values
  ('English Language', '1123', 'O_LEVEL', 'Cambridge O Level English Language', '#6D28D9', 'pen'),
  ('Islamiat', '2058', 'O_LEVEL', 'Cambridge O Level Islamiat', '#14B8A6', 'book'),
  ('Pakistan Studies', '2059', 'O_LEVEL', 'Cambridge O Level Pakistan Studies', '#EC4899', 'map'),
  ('Mathematics (Syllabus D)', '4024', 'O_LEVEL', 'Cambridge O Level Mathematics (Syllabus D)', '#8B5CF6', 'calculator'),
  ('Physics', '5054', 'O_LEVEL', 'Cambridge O Level Physics', '#0EA5E9', 'atom'),
  ('Chemistry', '5070', 'O_LEVEL', 'Cambridge O Level Chemistry', '#F97316', 'flask'),
  ('Biology', '5090', 'O_LEVEL', 'Cambridge O Level Biology', '#22C55E', 'dna'),
  ('Computer Science', '2210', 'O_LEVEL', 'Cambridge O Level Computer Science', '#2563EB', 'code'),
  ('Additional Mathematics', '403', 'O_LEVEL', 'Cambridge O Level Additional Mathematics', '#F59E0B', 'calculator'),
  ('Economics', '2281', 'O_LEVEL', 'Cambridge O Level Economics', '#0891B2', 'chart'),
  ('Commerce', '7100', 'O_LEVEL', 'Cambridge O Level Commerce', '#64748B', 'briefcase')
on conflict (code, level) do update set
  name = excluded.name,
  description = excluded.description,
  color = excluded.color,
  icon = excluded.icon;

delete from public.subjects
where level = 'A_LEVEL'
  and code not in ('9706', '9609', '9708', '9084', '9990', '9699', '9489', '9093', '9695', '9686', '9709', '9231', '9700', '9701', '9702', '9618', '9626');

insert into public.subjects (name, code, level, description, color, icon) values
  ('Accounting', '9706', 'A_LEVEL', 'Cambridge International AS & A Level Accounting', '#0EA5E9', 'ledger'),
  ('Business', '9609', 'A_LEVEL', 'Cambridge International AS & A Level Business', '#8B5CF6', 'briefcase'),
  ('Economics', '9708', 'A_LEVEL', 'Cambridge International AS & A Level Economics', '#0891B2', 'chart'),
  ('Law', '9084', 'A_LEVEL', 'Cambridge International AS & A Level Law', '#64748B', 'scale'),
  ('Psychology', '9990', 'A_LEVEL', 'Cambridge International AS & A Level Psychology', '#EC4899', 'brain'),
  ('Sociology', '9699', 'A_LEVEL', 'Cambridge International AS & A Level Sociology', '#14B8A6', 'users'),
  ('History', '9489', 'A_LEVEL', 'Cambridge International AS & A Level History', '#92400E', 'landmark'),
  ('English Language', '9093', 'A_LEVEL', 'Cambridge International AS & A Level English Language', '#6D28D9', 'pen'),
  ('English Literature', '9695', 'A_LEVEL', 'Cambridge International AS & A Level English Literature', '#BE185D', 'book-open'),
  ('Urdu - Pakistan', '9686', 'A_LEVEL', 'Cambridge International AS & A Level Urdu - Pakistan', '#16A34A', 'languages'),
  ('Mathematics', '9709', 'A_LEVEL', 'Cambridge International AS & A Level Mathematics', '#7C3AED', 'calculator'),
  ('Further Mathematics', '9231', 'A_LEVEL', 'Cambridge International AS & A Level Further Mathematics', '#F59E0B', 'calculator'),
  ('Biology', '9700', 'A_LEVEL', 'Cambridge International AS & A Level Biology', '#22C55E', 'dna'),
  ('Chemistry', '9701', 'A_LEVEL', 'Cambridge International AS & A Level Chemistry', '#F97316', 'flask'),
  ('Physics', '9702', 'A_LEVEL', 'Cambridge International AS & A Level Physics', '#2563EB', 'atom'),
  ('Computer Science', '9618', 'A_LEVEL', 'Cambridge International AS & A Level Computer Science', '#1D4ED8', 'code'),
  ('Information Technology', '9626', 'A_LEVEL', 'Cambridge International AS & A Level Information Technology', '#475569', 'monitor')
on conflict (code, level) do update set
  name = excluded.name,
  description = excluded.description,
  color = excluded.color,
  icon = excluded.icon;
