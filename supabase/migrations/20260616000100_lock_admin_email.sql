delete from public.admin_users
where lower(email) <> 'frx.technologies@gmail.com';

insert into public.admin_users (email)
values ('frx.technologies@gmail.com')
on conflict (email) do nothing;

