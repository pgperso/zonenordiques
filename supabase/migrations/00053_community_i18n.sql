-- Bilingual community names and descriptions
--
-- Most tribunes use the same name in French and English (proper nouns:
-- "Canadiens de Montréal", "PGA"). But major-league abbreviations differ:
-- LNH/NHL, LMB/MLB, LCF/CFL. To serve the /en locale correctly we add
-- `name_en` and `description_en` columns and populate them where the
-- English form is meaningfully different.
--
-- A NULL in `name_en` means "fall back to `name`" — the UI helper
-- (displayCommunityName) handles this transparently.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description_en TEXT;

-- 1. Major league tribunes ---------------------------------------------------

UPDATE public.communities SET
  name_en = 'NHL',
  description_en = 'The home tribune for National Hockey League fans. Follow games, trades and playoff runs, share your analysis and debate live with the community.'
WHERE slug = 'lnh';

UPDATE public.communities SET
  name_en = 'MLB',
  description_en = 'The home tribune for Major League Baseball fans. Discuss the regular season, the World Series, trades and your favourite All-Stars.'
WHERE slug = 'lmb';

UPDATE public.communities SET
  name_en = 'NBA',
  description_en = 'The home tribune for NBA fans. Follow games, picks, the draft and debate the GOAT — live with the community.'
WHERE slug = 'nba';

UPDATE public.communities SET
  name_en = 'NFL',
  description_en = 'The home tribune for NFL fans. Picks, fantasy, trades, draft and the Super Bowl — it''s all here.'
WHERE slug = 'nfl';

UPDATE public.communities SET
  name_en = 'CFL',
  description_en = 'The home tribune for Canadian Football League fans. From the Grey Cup to local rivalries, talk Canadian football here.'
WHERE slug = 'lcf';

UPDATE public.communities SET
  name_en = 'MLS',
  description_en = 'The home tribune for Major League Soccer fans. CF Montréal, Toronto FC, conference finals and the MLS Cup — discuss North American soccer.'
WHERE slug = 'mls';

UPDATE public.communities SET
  name_en = 'F1',
  description_en = 'The home tribune for Formula 1 fans. Canadian Grand Prix, drivers'' and constructors'' championships, strategy and paddock debates.'
WHERE slug = 'f1';

UPDATE public.communities SET
  name_en = 'UFC',
  description_en = 'The home tribune for MMA and UFC fans. Fight cards, picks, pound-for-pound rankings and the legacy of Georges St-Pierre.'
WHERE slug = 'ufc';

-- 2. La Taverne (Quebec-specific, but provide an English-friendly form) ----

UPDATE public.communities SET
  name_en = 'The Tavern',
  description_en = 'The tribune for chatting about anything and nothing. No sports required — just good vibes.'
WHERE slug = 'la-taverne' AND name_en IS NULL;

-- 3. PGA (same acronym, but English description) ---------------------------

UPDATE public.communities SET
  name_en = 'PGA',
  description_en = 'The home tribune for golf and PGA Tour fans. Follow the tournaments, share your analysis and discuss live!'
WHERE slug = 'pga' AND name_en IS NULL;
