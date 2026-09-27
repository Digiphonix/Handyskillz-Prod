-- Latest position only; clients access tracking through the authenticated API.
create table if not exists public.job_tracking (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  provider_id text not null references public.profiles(id),
  session_id uuid not null default gen_random_uuid(),
  sharing boolean not null default false,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy double precision check (accuracy >= 0 and accuracy <= 100000),
  travel_status text not null default 'en_route' check (travel_status in ('en_route', 'arrived')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);
alter table public.job_tracking enable row level security;
revoke all on public.job_tracking from anon, authenticated;
grant all on public.job_tracking to service_role;

-- Serialize updates with assignment/status transitions. Session IDs prevent an
-- old phone or a late network request from restarting stopped sharing.
create or replace function public.update_job_tracking(
  p_job_id uuid, p_provider_id text, p_action text,
  p_session_id uuid default null, p_latitude double precision default null,
  p_longitude double precision default null, p_accuracy double precision default null,
  p_travel_status text default 'en_route'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_job public.jobs%rowtype;
  v_session uuid;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.selected_provider_id is distinct from p_provider_id then
    raise exception 'Only the assigned provider can share location' using errcode = '42501';
  end if;
  if p_action = 'stop' then
    update public.job_tracking set sharing = false, latitude = null, longitude = null,
      accuracy = null, expires_at = now(), updated_at = now()
    where job_id = p_job_id and session_id = p_session_id;
    return p_session_id;
  end if;
  if v_job.status not in ('matched', 'in_progress') then
    raise exception 'Tracking is available only for active assigned jobs' using errcode = '22023';
  end if;
  if p_action = 'start' then
    v_session := gen_random_uuid();
    insert into public.job_tracking (job_id, provider_id, session_id, sharing, expires_at)
    values (p_job_id, p_provider_id, v_session, true, now() + interval '90 seconds')
    on conflict (job_id) do update set provider_id = excluded.provider_id,
      session_id = excluded.session_id, sharing = true, latitude = null, longitude = null,
      accuracy = null, travel_status = 'en_route', updated_at = now(), expires_at = excluded.expires_at;
    return v_session;
  end if;
  if p_action <> 'update' or p_latitude is null or p_longitude is null
    or not (p_latitude between -90 and 90) or not (p_longitude between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy between 0 and 100000))
    or p_travel_status not in ('en_route', 'arrived') then
    raise exception 'Invalid tracking update' using errcode = '22023';
  end if;
  update public.job_tracking set latitude = p_latitude, longitude = p_longitude,
    accuracy = p_accuracy, travel_status = p_travel_status, updated_at = now(),
    expires_at = now() + interval '90 seconds'
  where job_id = p_job_id and provider_id = p_provider_id and session_id = p_session_id
    and sharing and expires_at > now()
  returning session_id into v_session;
  if v_session is null then
    raise exception 'Sharing session expired or stopped. Start sharing again.' using errcode = '22023';
  end if;
  return v_session;
end;
$$;
revoke all on function public.update_job_tracking(uuid,text,text,uuid,double precision,double precision,double precision,text) from public, anon, authenticated;
grant execute on function public.update_job_tracking(uuid,text,text,uuid,double precision,double precision,double precision,text) to service_role;

create or replace function public.clear_closed_job_tracking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('matched', 'in_progress')
    or new.selected_provider_id is distinct from old.selected_provider_id then
    delete from public.job_tracking where job_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_closed_job_tracking on public.jobs;
create trigger clear_closed_job_tracking after update of status, selected_provider_id on public.jobs
for each row execute function public.clear_closed_job_tracking();
