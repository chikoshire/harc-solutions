-- Rollback (only succeeds if no rows have NULL contact_email).
-- Run manually after reviewing data; not applied by Supabase CLI by default.

DROP INDEX IF EXISTS public.cold_leads_contact_email_source_key;

ALTER TABLE public.cold_leads
  DROP CONSTRAINT IF EXISTS cold_leads_has_contact_method;

ALTER TABLE public.cold_leads
  ALTER COLUMN contact_email SET NOT NULL,
  ALTER COLUMN contact_name SET NOT NULL;

ALTER TABLE public.cold_leads
  ADD CONSTRAINT cold_leads_contact_email_source_key UNIQUE (contact_email, source);
