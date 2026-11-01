-- Slice 2. Run ONCE in Supabase > SQL Editor. Do NOT re-run 01_schema.sql.
alter table public.profiles add column must_change_password boolean not null default false;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, usn, full_name, must_change_password)
  values (new.id, split_part(new.email, '@', 1),
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), true);
  return new;
end $$;

create or replace function public.password_changed() returns void
language sql security definer set search_path = public as
$$ update public.profiles set must_change_password = false where id = auth.uid() $$;
grant execute on function public.password_changed() to authenticated;

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, semester int);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null,
  required_pct int check (required_pct between 1 and 100)); -- null = use global default
create table public.section_students (
  section_id uuid references public.sections(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  primary key (section_id, student_id));
create table public.teaching_assignments (
  section_id uuid references public.sections(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  primary key (section_id, subject_id));

alter table public.sections enable row level security;
alter table public.subjects enable row level security;
alter table public.section_students enable row level security;
alter table public.teaching_assignments enable row level security;

create policy "admin all" on public.sections for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.subjects for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.section_students for all using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.teaching_assignments for all using (public.is_admin()) with check (public.is_admin());

-- Non-admins see only what concerns them.
create policy "own membership" on public.section_students for select using (student_id = auth.uid());
create policy "own assignments" on public.teaching_assignments for select using (teacher_id = auth.uid());
create policy "my sections" on public.sections for select using (
  exists (select 1 from public.section_students ss where ss.section_id = sections.id and ss.student_id = auth.uid())
  or exists (select 1 from public.teaching_assignments ta where ta.section_id = sections.id and ta.teacher_id = auth.uid()));
create policy "my subjects" on public.subjects for select using (
  exists (select 1 from public.teaching_assignments ta where ta.subject_id = subjects.id and ta.teacher_id = auth.uid()));
