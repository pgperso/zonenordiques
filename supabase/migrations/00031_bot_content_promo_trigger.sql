-- Bot promotes a random article or podcast from the community
-- every N messages (non-bot) in that community.

CREATE OR REPLACE FUNCTION promote_community_content()
RETURNS TRIGGER AS $$
DECLARE
  bot_id UUID := '00000000-0000-0000-0000-000000000001';
  promo_interval INT := 50; -- every 50 messages
  msg_count INT;
  content_title TEXT;
  content_type TEXT;
  templates TEXT[];
  promo_msg TEXT;
BEGIN
  -- Skip bot messages to avoid infinite loop
  IF NEW.member_id = bot_id THEN
    RETURN NEW;
  END IF;

  -- Count non-bot messages in this community
  SELECT count(*) INTO msg_count
  FROM chat_messages
  WHERE community_id = NEW.community_id
    AND member_id != bot_id;

  -- Only promote every N messages
  IF msg_count % promo_interval != 0 THEN
    RETURN NEW;
  END IF;

  -- Randomly pick article or podcast (coin flip)
  IF random() < 0.5 THEN
    -- Try an article
    SELECT title INTO content_title
    FROM articles
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND is_removed = FALSE
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'article';
      templates := ARRAY[
        '📖 T''as lu "' || content_title || '" ? C''est dans l''onglet Contenu. Check ça !',
        '💡 Petit rappel : l''article "' || content_title || '" est dispo. Bonne lecture !',
        '📰 Si t''as manqué "' || content_title || '", c''est encore là ! Va voir ça.',
        '✍️ "' || content_title || '" — un article à (re)découvrir dans le contenu.',
        '🗞️ Savais-tu qu''on a "' || content_title || '" dans nos articles ? Jette un oeil !'
      ];
    END IF;
  END IF;

  -- If no article picked, try a podcast
  IF content_type IS NULL THEN
    SELECT title INTO content_title
    FROM podcasts
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND (is_removed = FALSE OR is_removed IS NULL)
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'podcast';
      templates := ARRAY[
        '🎧 T''as écouté "' || content_title || '" ? C''est dans les podcasts. Bonne écoute !',
        '🎙️ Le podcast "' || content_title || '" est dispo. Monte le son !',
        '🔊 Petit rappel : "' || content_title || '" est dans les podcasts. À écouter !',
        '📻 Si t''as manqué "' || content_title || '", c''est encore là ! Va l''écouter.',
        '🎤 "' || content_title || '" — un podcast à (re)découvrir !'
      ];
    END IF;
  END IF;

  -- No content to promote
  IF content_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Pick a random template and insert bot message
  promo_msg := templates[1 + floor(random() * array_length(templates, 1))::int];

  INSERT INTO chat_messages (community_id, member_id, content)
  VALUES (NEW.community_id, bot_id, promo_msg);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_promote_content
  AFTER INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION promote_community_content();
