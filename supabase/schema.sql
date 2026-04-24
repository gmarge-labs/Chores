create extension if not exists "pgcrypto";

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.parent_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (family_id, user_id)
);

create table if not exists public.kids (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  avatar text,
  kid_pin_hash text,
  points integer not null default 0,
  points_per_dollar_reward integer not null default 100,
  dollar_reward_value integer not null default 20,
  celebration_threshold integer not null default 100,
  last_celebrated_threshold integer not null default 0,
  missed_days_in_a_row integer not null default 0,
  last_missed_check_date date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  title text not null,
  detail text,
  points integer not null default 0,
  recurring_key text not null default 'daily',
  due_time_label text,
  status text not null check (status in ('due', 'awaiting', 'completed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  title text not null,
  cost integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.adjustments (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('bonus', 'penalty')),
  points_delta integer not null,
  display_value text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reason_lists (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  reason_type text not null check (reason_type in ('bonus', 'penalty')),
  reason text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.family_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  parent_pin_hash text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_family_parent(target_family_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.parent_memberships pm
    where pm.family_id = target_family_id
      and pm.user_id = auth.uid()
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists family_settings_set_updated_at on public.family_settings;
create trigger family_settings_set_updated_at
before update on public.family_settings
for each row
execute function public.set_updated_at();

alter table public.families enable row level security;
alter table public.parent_memberships enable row level security;
alter table public.kids enable row level security;
alter table public.tasks enable row level security;
alter table public.rewards enable row level security;
alter table public.adjustments enable row level security;
alter table public.reason_lists enable row level security;
alter table public.family_settings enable row level security;

create policy "parents can view their families"
on public.families
for select
using (public.is_family_parent(id));

create policy "parents can create memberships for themselves"
on public.parent_memberships
for insert
with check (user_id = auth.uid());

create policy "parents can view memberships in their family"
on public.parent_memberships
for select
using (public.is_family_parent(family_id));

create policy "parents can manage kids in their family"
on public.kids
for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));

create policy "parents can manage tasks in their family"
on public.tasks
for all
using (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
)
with check (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
);

create policy "parents can manage rewards in their family"
on public.rewards
for all
using (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
)
with check (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
);

create policy "parents can manage adjustments in their family"
on public.adjustments
for all
using (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
)
with check (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
);

create policy "parents can manage reason lists in their family"
on public.reason_lists
for all
using (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
)
with check (
  exists (
    select 1
    from public.kids k
    where k.id = kid_id
      and public.is_family_parent(k.family_id)
  )
);

create policy "parents can manage family settings in their family"
on public.family_settings
for all
using (public.is_family_parent(family_id))
with check (public.is_family_parent(family_id));
