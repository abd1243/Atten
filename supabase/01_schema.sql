-- Slice 1: profiles + roles. Run once in Supabase > SQL Editor.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usn text unique not null,
  full_name text not null,
  role text not null default 'student' check (role in ('admin','teacher','student')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- A user can read ONLY their own row. Admin can do everything.
-- There is deliberately no update policy for normal users, so nobody can promote themselves.
create policy "read own profile" on public.profiles for select using (id = auth.uid());
create policy "admin full access" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Every new login automatically gets a profile as a STUDENT. Roles are only changed by SQL/admin.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, usn, full_name)
  values (new.id, split_part(new.email, '@', 1),
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();
