-- Bilingual category names
--
-- All sport categories except "Sport automobile" have the same name in
-- French and English. Adding name_en mirrors the pattern from
-- migration 00053 (communities) and lets the new /sport/[slug] route
-- render correct headers and metadata on the /en locale.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS name_en VARCHAR(100);

UPDATE public.categories SET name_en = 'Hockey'     WHERE slug = 'hockey'     AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Baseball'   WHERE slug = 'baseball'   AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Football'   WHERE slug = 'football'   AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Soccer'     WHERE slug = 'soccer'     AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Golf'       WHERE slug = 'golf'       AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Basketball' WHERE slug = 'basketball' AND name_en IS NULL;
UPDATE public.categories SET name_en = 'Motorsport' WHERE slug = 'motorsport' AND name_en IS NULL;
UPDATE public.categories SET name_en = 'MMA'        WHERE slug = 'mma'        AND name_en IS NULL;
