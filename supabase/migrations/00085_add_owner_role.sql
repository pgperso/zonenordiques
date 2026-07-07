-- ============================================================
-- 00085: Seed the missing "owner" role
--
-- The whole app gates owner-only features on roles.code = 'owner'
-- (Vestiaire, pool management, Exposmètre/Nordiquomètre admin, the
-- "Propriétaire" chat badge, canModerate/canCreate shortcuts). But the
-- roles catalogue only ever seeded admin/moderator/member/creator, so
-- no one could actually hold the owner role. This adds it.
--
-- Assigning it to a specific member is a data operation (member ids are
-- instance-specific) done outside this migration.
-- ============================================================

INSERT INTO public.roles (code, name)
VALUES ('owner', 'Propriétaire')
ON CONFLICT (code) DO NOTHING;
