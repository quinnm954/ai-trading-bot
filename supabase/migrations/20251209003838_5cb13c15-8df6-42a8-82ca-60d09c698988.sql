-- Drop trigger first
DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;

-- Drop function with cascade
DROP FUNCTION IF EXISTS public.handle_new_user_role();
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

-- Drop table
DROP TABLE IF EXISTS public.user_roles;

-- Drop enum type
DROP TYPE IF EXISTS public.app_role;