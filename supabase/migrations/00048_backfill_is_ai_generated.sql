-- Definitive backfill of articles.is_ai_generated based on author persona.
--
-- Rule enforced by the editor (ArticleEditor.tsx) and now applied to history:
--   An article IS AI-generated  iff  it is published under one of our fictional
--   content authors (Rex Paquette, DJ Labombarde, Maika Blitz, Roxane Fury).
--
-- Everything else — including the 541 chronicles imported from Zone Nordiques
-- in 2026-03-30, written by real human contributors — is HUMAN content and
-- stays is_ai_generated = FALSE (no badge shown to readers).
--
-- This migration is idempotent: running it twice produces the same result.

-- Articles published under a persona → flag as AI
UPDATE public.articles
SET is_ai_generated = TRUE
WHERE author_name_override IN (
  'Rex Paquette',
  'DJ Labombarde',
  'Maika Blitz',
  'Roxane Fury'
)
AND is_ai_generated IS DISTINCT FROM TRUE;

-- Everything else → flag as human (fixes any wrong mass-backfill from
-- migration 00047's earlier buggy version)
UPDATE public.articles
SET is_ai_generated = FALSE
WHERE (
  author_name_override IS NULL
  OR author_name_override NOT IN (
    'Rex Paquette',
    'DJ Labombarde',
    'Maika Blitz',
    'Roxane Fury'
  )
)
AND is_ai_generated IS DISTINCT FROM FALSE;
