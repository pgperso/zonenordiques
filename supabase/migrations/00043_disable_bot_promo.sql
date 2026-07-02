-- Disable the auto-promotion bot trigger.
--
-- Context: Google AdSense flagged the site for "low-value content" multiple times.
-- Automated bot-generated chat messages (posted every 50 messages) look like
-- synthetic engagement / thin-content spam to AdSense's review bots. Removing
-- the trigger eliminates that signal while keeping the function definition
-- available in case we later decide to re-enable promotions through a
-- different mechanism (e.g. in-app UI cards instead of chat messages).
--
-- Safe to re-apply: DROP TRIGGER IF EXISTS is idempotent.

DROP TRIGGER IF EXISTS trg_promote_content ON public.chat_messages;
