create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  label text not null default 'Home',
  recipient_name text not null,
  phone text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state text not null,
  postal_code text,
  country text not null default 'Nigeria',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_addresses_user_created_idx
  on public.customer_addresses (user_id, created_at desc);

create unique index if not exists customer_addresses_one_default_per_user_idx
  on public.customer_addresses (user_id) where is_default;

alter table public.customer_addresses enable row level security;
revoke all on public.customer_addresses from anon, authenticated;

create table if not exists public.payout_accounts (
  user_id text primary key references public.profiles(id) on delete cascade,
  paystack_recipient_code text not null unique,
  bank_name text not null,
  account_name text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;
revoke all on public.payout_accounts from anon, authenticated;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  subject text not null,
  message text not null check (length(message) <= 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_created_idx on public.support_tickets (user_id, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx on public.user_notifications (user_id, created_at desc);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from anon, authenticated;
