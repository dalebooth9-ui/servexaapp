-- Hash unsubscribe tokens at rest
ALTER TABLE public.email_unsubscribe_tokens
  ADD COLUMN IF NOT EXISTS token_hash TEXT;

-- Backfill: hash existing plaintext tokens with SHA-256 hex
UPDATE public.email_unsubscribe_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL AND token IS NOT NULL;

-- Drop old plaintext token column and its index
DROP INDEX IF EXISTS public.idx_unsubscribe_tokens_token;
ALTER TABLE public.email_unsubscribe_tokens DROP COLUMN IF EXISTS token;

-- Enforce non-null and uniqueness on token_hash
ALTER TABLE public.email_unsubscribe_tokens ALTER COLUMN token_hash SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.email_unsubscribe_tokens
    ADD CONSTRAINT email_unsubscribe_tokens_token_hash_key UNIQUE (token_hash);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token_hash
  ON public.email_unsubscribe_tokens(token_hash);