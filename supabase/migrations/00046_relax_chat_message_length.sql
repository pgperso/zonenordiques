-- Relax the chat_messages.content length CHECK constraint from 1000 to 5000.
-- The shared constant CHAT_MAX_MESSAGE_LENGTH was raised but the DB-level
-- CHECK (added in migration 00017_hardening.sql as `valid_message_length`)
-- still enforced 1000, which caused INSERTs to fail silently with a
-- constraint violation when users pasted long analyses. We drop the old
-- constraint and add the new one so client + DB agree on 5000.

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS valid_message_length;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT valid_message_length
  CHECK (content IS NULL OR char_length(content) <= 5000);
