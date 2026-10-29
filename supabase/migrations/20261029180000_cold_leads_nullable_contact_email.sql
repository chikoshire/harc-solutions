-- Allow cold leads with name and/or phone only (no email), e.g. handover imports.
-- Safe for production: no data deleted; tightens row validity with a CHECK.

ALTER TABLE public.cold_leads
  DROP CONSTRAINT IF EXISTS cold_leads_contact_email_source_key;

ALTER TABLE public.cold_leads
  ALTER COLUMN contact_email DROP NOT NULL,
  ALTER COLUMN contact_name DROP NOT NULL;

ALTER TABLE public.cold_leads
  ADD CONSTRAINT cold_leads_has_contact_method CHECK (
    NULLIF(BTRIM(contact_email), '') IS NOT NULL
    OR NULLIF(BTRIM(contact_name), '') IS NOT NULL
    OR NULLIF(BTRIM(phone), '') IS NOT NULL
  );

CREATE UNIQUE INDEX cold_leads_contact_email_source_key
  ON public.cold_leads (contact_email, source)
  WHERE contact_email IS NOT NULL;
