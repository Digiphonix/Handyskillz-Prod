-- Existing listings retain their original job-request semantics.
alter table public.jobs
  add column if not exists listing_type text not null default 'job_request'
    check (listing_type in ('job_request', 'service_offer'));

-- A service advertisement is an enquiry listing, not a customer-funded job.
alter table public.jobs add constraint service_offer_has_no_assignment
  check (listing_type <> 'service_offer' or
    (selected_provider_id is null and status in ('draft', 'open', 'cancelled')));
