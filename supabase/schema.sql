create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Наша пара',
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

create table if not exists public.promises (
  id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  name text not null,
  area text not null default '',
  promised_at text not null,
  planned_for text,
  visited_at text,
  priority text not null check (priority in ('Высокий', 'Средний', 'Нежный')),
  status text not null check (status in ('promised', 'planned', 'done')),
  note text not null default '',
  image text not null default '',
  memory text,
  memory_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promises
add column if not exists couple_id uuid references public.couples(id) on delete set null;

alter table public.promises enable row level security;

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

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users can manage own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('promise-photos', 'promise-photos', true)
on conflict (id) do nothing;

create policy "Users can upload own promise photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'promise-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own promise photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'promise-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'promise-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read own promise photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'promise-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
