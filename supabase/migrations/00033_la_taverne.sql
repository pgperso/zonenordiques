-- La Taverne: global tribune available to everyone, can't leave
INSERT INTO communities (name, slug, description, is_active, member_count)
VALUES ('La Taverne', 'la-taverne', 'La tribune pour jaser de tout et de rien. Pas besoin de sport, juste du bon temps.', TRUE, 0)
ON CONFLICT (slug) DO NOTHING;

-- Auto-join all existing members
INSERT INTO community_members (community_id, member_id)
SELECT c.id, m.id FROM communities c, members m WHERE c.slug = 'la-taverne'
ON CONFLICT DO NOTHING;

-- Update member count
UPDATE communities SET member_count = (
  SELECT count(*) FROM community_members WHERE community_id = communities.id
) WHERE slug = 'la-taverne';

-- Auto-join new users to La Taverne
CREATE OR REPLACE FUNCTION auto_join_taverne()
RETURNS TRIGGER AS $fn$
DECLARE
  taverne_id INT;
BEGIN
  SELECT id INTO taverne_id FROM communities WHERE slug = 'la-taverne';
  IF taverne_id IS NOT NULL THEN
    INSERT INTO community_members (community_id, member_id)
    VALUES (taverne_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_join_taverne ON members;
CREATE TRIGGER trg_auto_join_taverne
  AFTER INSERT ON members
  FOR EACH ROW
  EXECUTE FUNCTION auto_join_taverne();
