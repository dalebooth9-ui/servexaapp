
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS ms_send_mailbox text,
  ADD COLUMN IF NOT EXISTS ms_send_mode text NOT NULL DEFAULT 'send'
    CHECK (ms_send_mode IN ('send','draft','off'));

UPDATE public.organisations
SET ms_send_mailbox = 'service@vivafire.co.uk',
    ms_send_mode    = 'send'
WHERE lower(slug) = 'vivafire' OR lower(name) LIKE '%viva fire%';
