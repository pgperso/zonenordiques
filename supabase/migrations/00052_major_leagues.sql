-- Major league tribunes
--
-- League-level tribunes (LNH, LMB, NBA, NFL, LCF, MLS, F1, UFC). These
-- complement existing team tribunes (Canadiens, Nordiques, Blue Jays...)
-- by providing a place to discuss the league as a whole — trade rumours,
-- awards, schedule, season-wide debates.
--
-- Three new categories are introduced for sports that did not yet have
-- one: basketball (NBA), motorsport (F1) and MMA (UFC). Hockey, baseball,
-- football and soccer categories already exist from migration 00028.

-- 1. New categories ---------------------------------------------------------

INSERT INTO public.categories (name, slug, icon, sort_order) VALUES
  ('Basketball', 'basketball', 'basketball', 6),
  ('Sport automobile', 'motorsport', 'car', 7),
  ('MMA', 'mma', 'mma', 8)
ON CONFLICT (slug) DO NOTHING;

-- 2. League tribunes --------------------------------------------------------

INSERT INTO public.communities (name, slug, description, primary_color, secondary_color, is_active)
VALUES
  (
    'LNH',
    'lnh',
    'La tribune des partisans de la Ligue nationale de hockey. Suivez les matchs, les transactions et les séries éliminatoires, partagez vos analyses et débattez en direct.',
    '#000000',
    '#C8102E',
    true
  ),
  (
    'LMB',
    'lmb',
    'La tribune des amateurs de baseball majeur. Discutez de la saison régulière, des Séries mondiales, des échanges et de vos joueurs étoiles préférés.',
    '#002D72',
    '#D50032',
    true
  ),
  (
    'NBA',
    'nba',
    'La tribune des fans de la NBA. Suivez les matchs, les pronostics, le repêchage et débattez du GOAT — en direct avec la communauté.',
    '#1D428A',
    '#C8102E',
    true
  ),
  (
    'NFL',
    'nfl',
    'La tribune des passionnés de la NFL. Pronostics, fantasy, échanges, repêchage et Super Bowl — tout y passe.',
    '#013369',
    '#D50A0A',
    true
  ),
  (
    'LCF',
    'lcf',
    'La tribune des partisans de la Ligue canadienne de football. De la Coupe Grey aux rivalités locales, parlez football d''ici.',
    '#C8102E',
    '#000000',
    true
  ),
  (
    'MLS',
    'mls',
    'La tribune des fans de la Major League Soccer. CF Montréal, Toronto FC, finales de conférence et MLS Cup — discutez du soccer nord-américain.',
    '#001A70',
    '#C8102E',
    true
  ),
  (
    'F1',
    'f1',
    'La tribune des passionnés de Formule 1. Grand Prix du Canada, championnats des pilotes et des constructeurs, stratégies et débats de paddock.',
    '#E10600',
    '#15151E',
    true
  ),
  (
    'UFC',
    'ufc',
    'La tribune des amateurs de MMA et de l''UFC. Cartes de combat, pronostics, classements pound-for-pound et héritage de Georges St-Pierre.',
    '#D20A0A',
    '#000000',
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- 3. Link tribunes to categories -------------------------------------------

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'hockey')
  WHERE slug = 'lnh';

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'baseball')
  WHERE slug = 'lmb';

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'basketball')
  WHERE slug = 'nba';

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'football')
  WHERE slug IN ('nfl', 'lcf');

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'soccer')
  WHERE slug = 'mls';

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'motorsport')
  WHERE slug = 'f1';

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'mma')
  WHERE slug = 'ufc';
