-- Atomically select one open-job proposal and close the remaining proposals.
alter table public.escrow_transactions
  add column if not exists paystack_transfer_reference text unique,
  add column if not exists paystack_transfer_code text,
  add column if not exists paystack_authorization_url text,
  add column if not exists release_status text not null default 'waiting'
    check (release_status in ('waiting', 'ready', 'processing', 'awaiting_otp', 'released', 'failed'));

create unique index if not exists escrow_transactions_one_active_job_idx
  on public.escrow_transactions (job_id)
  where status in ('pending', 'funded', 'partially_released');

create or replace function public.accept_job_bid(p_job_id uuid, p_bid_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_provider text;
  current_customer text;
begin
  select customer_id into current_customer
  from public.jobs
  where id = p_job_id and status = 'open'
  for update;

  if current_customer is null then
    raise exception 'job is not open';
  end if;

  select provider_id into selected_provider
  from public.job_bids
  where id = p_bid_id
    and job_id = p_job_id
    and status in ('pending', 'shortlisted')
  for update;

  if selected_provider is null then
    raise exception 'pending proposal not found';
  end if;

  update public.jobs
  set selected_provider_id = selected_provider,
      status = 'matched',
      updated_at = now()
  where id = p_job_id;

  update public.job_bids
  set status = case when id = p_bid_id then 'accepted'::public.bid_status else 'rejected'::public.bid_status end,
      updated_at = now()
  where job_id = p_job_id and status in ('pending', 'shortlisted');

  return selected_provider;
end;
$$;

revoke all on function public.accept_job_bid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_job_bid(uuid, uuid) to service_role;

create or replace function public.begin_escrow_release(p_job_id uuid, p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payout record;
begin
  select e.id, e.payee_id, e.amount_ngn, p.paystack_recipient_code
  into payout
  from public.escrow_transactions e
  join public.payout_accounts p on p.user_id = e.payee_id
  where e.job_id = p_job_id and e.status = 'funded' and e.release_status = 'ready'
  for update of e;

  if not found then
    raise exception 'funded payment or provider payout account not ready';
  end if;

  update public.escrow_transactions
  set release_status = 'processing', paystack_transfer_reference = p_reference, updated_at = now()
  where id = payout.id;

  return jsonb_build_object(
    'escrow_id', payout.id,
    'provider_id', payout.payee_id,
    'amount_ngn', payout.amount_ngn,
    'recipient_code', payout.paystack_recipient_code
  );
end;
$$;

revoke all on function public.begin_escrow_release(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_escrow_release(uuid, text) to service_role;

create or replace function public.increment_provider_completed_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'released' and old.status is distinct from 'released' then
    update public.profiles
    set completed_jobs = completed_jobs + 1,
        updated_at = now()
    where id = new.payee_id;
  end if;
  return new;
end;
$$;

drop trigger if exists escrow_released_updates_provider_jobs on public.escrow_transactions;
create trigger escrow_released_updates_provider_jobs
after update of status on public.escrow_transactions
for each row execute function public.increment_provider_completed_jobs();
