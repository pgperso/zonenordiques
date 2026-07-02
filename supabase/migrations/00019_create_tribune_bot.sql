-- TribuneBot: Auto-announces new articles and podcasts in community feeds
-- Bot user ID: 00000000-0000-0000-0000-000000000001

-- Step 1: Create bot auth user
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, role, aud, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'bot@fanstribune.com',
  '',
  NOW(),
  'authenticated',
  'authenticated',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Step 2: Create bot member profile (handle trigger conflict)
INSERT INTO members (id, username, email, description, is_verified)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'TribuneBot',
  'bot@fanstribune.com',
  'Bot officiel — Annonce les nouveaux articles et podcasts.',
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  username = 'TribuneBot',
  description = EXCLUDED.description,
  is_verified = TRUE;

-- Step 3: Join bot to all existing communities
INSERT INTO community_members (community_id, member_id)
SELECT id, '00000000-0000-0000-0000-000000000001'::UUID
FROM communities
ON CONFLICT (community_id, member_id) DO NOTHING;

-- Step 4: Auto-join bot to new communities
CREATE OR REPLACE FUNCTION auto_join_bot_to_community()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO community_members (community_id, member_id)
  VALUES (NEW.id, '00000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bot_auto_join
  AFTER INSERT ON communities
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_bot_to_community();

-- Step 5: Announce new articles
CREATE OR REPLACE FUNCTION announce_new_article()
RETURNS TRIGGER AS $$
DECLARE
  community_slug TEXT;
BEGIN
  IF NEW.is_published = TRUE AND NEW.is_removed = FALSE THEN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.is_published = FALSE) THEN
      SELECT slug INTO community_slug FROM communities WHERE id = NEW.community_id;

      INSERT INTO chat_messages (community_id, member_id, content)
      VALUES (
        NEW.community_id,
        '00000000-0000-0000-0000-000000000001',
        'Nouvel article : ' || NEW.title || ' — Lisez-le ici /communities/' || community_slug || '/articles/' || NEW.slug
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_announce_article
  AFTER INSERT OR UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION announce_new_article();

-- Step 6: Announce new podcasts
CREATE OR REPLACE FUNCTION announce_new_podcast()
RETURNS TRIGGER AS $$
DECLARE
  community_slug TEXT;
BEGIN
  IF NEW.is_published = TRUE THEN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.is_published = FALSE) THEN
      SELECT slug INTO community_slug FROM communities WHERE id = NEW.community_id;

      INSERT INTO chat_messages (community_id, member_id, content)
      VALUES (
        NEW.community_id,
        '00000000-0000-0000-0000-000000000001',
        'Nouveau podcast : ' || NEW.title || ' — Ecoutez-le ici /communities/' || community_slug || '/podcasts/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_announce_podcast
  AFTER INSERT OR UPDATE ON podcasts
  FOR EACH ROW
  EXECUTE FUNCTION announce_new_podcast();
