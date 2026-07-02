-- Add link_previews JSONB column to chat_messages
-- Stores extracted OG metadata for URLs in messages
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS link_previews JSONB DEFAULT '[]';
