DROP POLICY IF EXISTS "Anon can read forum posts" ON public.forum_posts;
DROP POLICY IF EXISTS "Anon can read forum comments" ON public.forum_comments;
DROP POLICY IF EXISTS "Anon can read forum reactions" ON public.forum_reactions;

REVOKE SELECT ON public.forum_posts FROM anon;
REVOKE SELECT ON public.forum_comments FROM anon;
REVOKE SELECT ON public.forum_reactions FROM anon;