-- =========================================
-- Fix is_admin() function: SECURITY DEFINER needs explicit search_path
-- =========================================
-- The previous version of is_admin() used SECURITY DEFINER without an
-- explicit search_path, causing the function to fail to find user_roles
-- in some contexts (PostgREST execution context). Additionally, auth.uid()
-- behaves more reliably with INVOKER security context for this use case.
--
-- This migration:
--   1. Drops and recreates is_admin() with SECURITY INVOKER + explicit search_path
--   2. Grants EXECUTE on is_admin() to the authenticated role explicitly
--   3. Forces PostgREST to reload its schema cache

DROP FUNCTION IF EXISTS is_admin();

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Explicit grant so the authenticated role can execute the function
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- Also grant authenticated role permission to SELECT from user_roles
-- (needed for the EXISTS check inside is_admin() to work under SECURITY INVOKER)
GRANT SELECT ON user_roles TO authenticated;

-- Force PostgREST to reload its schema cache so the new function is recognized
NOTIFY pgrst, 'reload schema';
