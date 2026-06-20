-- Add a second content administrator without removing the platform owner.
insert into public.admin_users (email)
values ('ferozemughal8@gmail.com')
on conflict (email) do nothing;
