-- Handyskillz Skill Hub schema
-- Clerk is the identity provider, so profile IDs store Clerk user IDs as text.
-- The API uses SUPABASE_SERVICE_ROLE_KEY for server-side writes and owns the
-- authorization boundary. Do not expose the service role key to the mobile app.

create extension if not exists "pgcrypto";

create type public.user_role as enum (
  'customer',
  'artisan',
  'professional',
  'business',
  'admin'
);

create type public.job_status as enum (
  'draft',
  'open',
  'matched',
  'in_progress',
  'completed',
  'cancelled',
  'disputed'
);

create type public.bid_status as enum (
  'pending',
  'shortlisted',
  'accepted',
  'rejected',
  'withdrawn'
);

create type public.escrow_status as enum (
  'pending',
  'funded',
  'partially_released',
  'released',
  'refunded',
  'disputed'
);

create table if not exists public.profiles (
  id text primary key,
  role public.user_role not null default 'customer',
  display_name text not null,
  phone text,
  city text not null default 'Lagos',
  bio text,
  avatar_url text,
  skills text[] not null default '{}',
  years_experience integer not null default 0 check (years_experience >= 0),
  hourly_rate_ngn numeric(12, 2) not null default 0 check (hourly_rate_ngn >= 0),
  availability text not null default 'available',
  is_verified boolean not null default false,
  onboarding_complete boolean not null default false,
  rating numeric(3, 2) not null default 0 check (rating >= 0 and rating <= 5),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  image_url text,
  project_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.profiles(id) on delete restrict,
  title text not null,
  description text not null,
  category text not null,
  location text,
  budget_min_ngn numeric(12, 2),
  budget_max_ngn numeric(12, 2),
  status public.job_status not null default 'draft',
  ai_match_summary text,
  selected_provider_id text references public.profiles(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_bids (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider_id text not null references public.profiles(id) on delete restrict,
  amount_ngn numeric(12, 2) not null check (amount_ngn >= 0),
  message text not null,
  status public.bid_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, provider_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id text not null references public.profiles(id) on delete restrict,
  body text not null check (length(body) <= 5000),
  message_type text not null default 'text',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete restrict,
  payer_id text not null references public.profiles(id) on delete restrict,
  payee_id text not null references public.profiles(id) on delete restrict,
  amount_ngn numeric(12, 2) not null check (amount_ngn > 0),
  amount_released_ngn numeric(12, 2) not null default 0 check (amount_released_ngn >= 0),
  status public.escrow_status not null default 'pending',
  paystack_reference text unique,
  paystack_access_code text,
  funded_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escrow_milestones (
  id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references public.escrow_transactions(id) on delete cascade,
  title text not null,
  amount_ngn numeric(12, 2) not null check (amount_ngn > 0),
  status text not null default 'pending',
  approved_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text,
  city text,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.guild_members (
  guild_id uuid not null references public.guilds(id) on delete cascade,
  profile_id text not null references public.profiles(id) on delete cascade,
  membership_role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (guild_id, profile_id)
);

create table if not exists public.saved_profiles (
  profile_id text not null references public.profiles(id) on delete cascade,
  saved_by text not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, saved_by)
);

create table if not exists public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references public.profiles(id) on delete cascade,
  document_type text not null,
  document_url text,
  status text not null default 'pending',
  reviewer_id text references public.profiles(id) on delete set null,
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_city_idx on public.profiles(role, city);
create index if not exists portfolio_items_profile_idx on public.portfolio_items(profile_id, sort_order);
create index if not exists jobs_status_category_idx on public.jobs(status, category);
create index if not exists job_bids_job_idx on public.job_bids(job_id, status);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists job_bids_updated_at on public.job_bids;
create trigger job_bids_updated_at before update on public.job_bids
for each row execute function public.set_updated_at();

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists escrow_transactions_updated_at on public.escrow_transactions;
create trigger escrow_transactions_updated_at before update on public.escrow_transactions
for each row execute function public.set_updated_at();

-- Profile and portfolio images are uploaded by the authenticated API server.
insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = excluded.public;

alter table public.profiles enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.jobs enable row level security;
alter table public.job_bids enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.escrow_transactions enable row level security;
alter table public.escrow_milestones enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.saved_profiles enable row level security;
alter table public.verification_submissions enable row level security;
alter table public.audit_logs enable row level security;

-- The API server uses the Supabase service role, which bypasses RLS.
-- These policies allow future Supabase clients to read public marketplace data
-- without granting write access to the mobile app.
drop policy if exists "public profiles are readable" on public.profiles;
create policy "public profiles are readable" on public.profiles
for select using (true);

drop policy if exists "public portfolio is readable" on public.portfolio_items;
create policy "public portfolio is readable" on public.portfolio_items
for select using (true);

drop policy if exists "public guilds are readable" on public.guilds;
create policy "public guilds are readable" on public.guilds
for select using (true);

drop policy if exists "public profile media is readable" on storage.objects;
create policy "public profile media is readable" on storage.objects
for select using (bucket_id = 'profile-media');