create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Our couple',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

alter table public.couples enable row level security;

create table if not exists public.couple_memberships (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner')) default 'partner',
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

alter table public.couple_memberships enable row level security;

alter table public.promises
add column if not exists couple_id uuid references public.couples(id) on delete set null;

drop policy if exists "Authenticated users can create couples" on public.couples;
drop policy if exists "Authenticated users can find couples by invite code" on public.couples;
drop policy if exists "Couple owners can update own couple" on public.couples;
drop policy if exists "Users can read own memberships" on public.couple_memberships;
drop policy if exists "Users can join couples as self" on public.couple_memberships;

create policy "Authenticated users can create couples"
on public.couples
for insert
to authenticated
with check (auth.uid() = created_by);

create policy "Authenticated users can find couples by invite code"
on public.couples
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.couple_memberships cm
    where cm.couple_id = couples.id
      and cm.user_id = auth.uid()
  )
  or invite_code is not null
);

create policy "Couple owners can update own couple"
on public.couples
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Users can read own memberships"
on public.couple_memberships
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can join couples as self"
on public.couple_memberships
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own promises" on public.promises;
drop policy if exists "Users can insert own promises" on public.promises;
drop policy if exists "Users can update own promises" on public.promises;
drop policy if exists "Users can delete own promises" on public.promises;

create policy "Users can read own promises"
on public.promises
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.couple_memberships cm
    where cm.couple_id = promises.couple_id
      and cm.user_id = auth.uid()
  )
);

create policy "Users can insert own promises"
on public.promises
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    couple_id is null
    or exists (
      select 1
      from public.couple_memberships cm
      where cm.couple_id = promises.couple_id
        and cm.user_id = auth.uid()
    )
  )
);

create policy "Users can update own promises"
on public.promises
for update
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.couple_memberships cm
    where cm.couple_id = promises.couple_id
      and cm.user_id = auth.uid()
  )
)
with check (
  auth.uid() = user_id
  or exists (
    select 1
    from public.couple_memberships cm
    where cm.couple_id = promises.couple_id
      and cm.user_id = auth.uid()
  )
);

create policy "Users can delete own promises"
on public.promises
for delete
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.couple_memberships cm
    where cm.couple_id = promises.couple_id
      and cm.user_id = auth.uid()
  )
);

select 'couples upgrade applied' as status;
