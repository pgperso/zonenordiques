-- Count article views as DISTINCT visitors (unique IP), anonymous included —
-- "a view = the number of different IPs that opened the article".
-- Only a SALTED HASH of the IP is stored, never the raw address.

CREATE TABLE IF NOT EXISTS public.article_views (
  article_id INT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (article_id, ip_hash)
);

ALTER TABLE public.article_views ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT policies on purpose: the table is written only by the
-- SECURITY DEFINER function below, and its hashes are never read by clients.

CREATE OR REPLACE FUNCTION public.record_article_view(p_article_id INT, p_ip_hash TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ip_hash IS NULL OR length(p_ip_hash) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.article_views (article_id, ip_hash)
  VALUES (p_article_id, p_ip_hash)
  ON CONFLICT (article_id, ip_hash) DO NOTHING;

  -- Only a genuinely new unique visitor bumps the public counter.
  IF FOUND THEN
    UPDATE public.articles SET view_count = view_count + 1 WHERE id = p_article_id;
  END IF;
END;
$$;

-- Anonymous visitors must be able to record a view (that's the whole point).
GRANT EXECUTE ON FUNCTION public.record_article_view(INT, TEXT) TO anon, authenticated;
