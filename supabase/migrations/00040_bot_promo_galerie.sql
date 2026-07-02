-- Update content promotion messages to reference Galerie de presse instead of "onglet Contenu"
CREATE OR REPLACE FUNCTION promote_community_content()
RETURNS TRIGGER AS $$
DECLARE
  bot_id UUID := '00000000-0000-0000-0000-000000000001';
  promo_interval INT := 50;
  msg_count INT;
  content_title TEXT;
  content_type TEXT;
  templates TEXT[];
  promo_msg TEXT;
BEGIN
  IF NEW.member_id = bot_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO msg_count
  FROM public.chat_messages
  WHERE community_id = NEW.community_id
    AND member_id != bot_id;

  IF msg_count % promo_interval != 0 THEN
    RETURN NEW;
  END IF;

  IF random() < 0.5 THEN
    SELECT title INTO content_title
    FROM public.articles
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND is_removed = FALSE
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'article';
      templates := ARRAY[
        '📖 T''as lu "' || content_title || '" ? Retrouve-le dans la Galerie de presse ! https://fanstribune.com/fr/galerie-de-presse',
        '💡 Petit rappel : l''article "' || content_title || '" est dispo dans la Galerie de presse. Bonne lecture !',
        '📰 Si t''as manqué "' || content_title || '", va faire un tour dans la Galerie de presse !',
        '✍️ "' || content_title || '" — un article à (re)découvrir dans la Galerie de presse. https://fanstribune.com/fr/galerie-de-presse',
        '🗞️ Savais-tu qu''on a "' || content_title || '" dans la Galerie de presse ? Jette un oeil !'
      ];
    END IF;
  END IF;

  IF content_type IS NULL THEN
    SELECT title INTO content_title
    FROM public.podcasts
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND (is_removed = FALSE OR is_removed IS NULL)
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'podcast';
      templates := ARRAY[
        '🎧 T''as écouté "' || content_title || '" ? Retrouve-le dans la Galerie de presse ! https://fanstribune.com/fr/galerie-de-presse',
        '🎙️ Le podcast "' || content_title || '" est dispo dans la Galerie de presse. Monte le son !',
        '🔊 Petit rappel : "' || content_title || '" est dans la Galerie de presse. À écouter !',
        '📻 Si t''as manqué "' || content_title || '", va l''écouter dans la Galerie de presse !',
        '🎤 "' || content_title || '" — un podcast à (re)découvrir dans la Galerie de presse !'
      ];
    END IF;
  END IF;

  IF content_type IS NULL THEN
    RETURN NEW;
  END IF;

  promo_msg := templates[1 + floor(random() * array_length(templates, 1))::int];

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (NEW.community_id, bot_id, promo_msg);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
