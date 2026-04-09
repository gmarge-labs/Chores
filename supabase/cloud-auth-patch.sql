create or replace function public.is_family_parent(target_family_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.parent_memberships pm
    where pm.family_id = target_family_id
      and pm.user_id = auth.uid()
  );
end;
$$;

drop policy if exists "parents can view their families" on public.families;
create policy "parents can view their families"
on public.families
for select
using (public.is_family_parent(id));

create policy "authenticated parents can create families"
on public.families
for insert
with check (auth.uid() is not null);

create policy "parents can update their families"
on public.families
for update
using (public.is_family_parent(id))
with check (public.is_family_parent(id));

drop policy if exists "parents can create memberships for themselves" on public.parent_memberships;
create policy "parents can create memberships for themselves"
on public.parent_memberships
for insert
with check (user_id = auth.uid());

drop policy if exists "parents can view memberships in their family" on public.parent_memberships;
create policy "parents can view memberships in their family"
on public.parent_memberships
for select
using (user_id = auth.uid() or public.is_family_parent(family_id));
