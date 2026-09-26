create table if not exists public.expo_push_tokens (
  expo_push_token text primary key,
  user_id text not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index if not exists expo_push_tokens_user_idx on public.expo_push_tokens (user_id);
alter table public.expo_push_tokens enable row level security;
revoke all on public.expo_push_tokens from anon, authenticated;
