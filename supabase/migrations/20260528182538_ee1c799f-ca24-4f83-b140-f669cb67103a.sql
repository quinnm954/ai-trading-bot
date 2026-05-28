-- Revoke EXECUTE from anon on internal SECURITY DEFINER functions.
-- These are all invoked from authenticated contexts (RLS policies, triggers, or
-- user-scoped RPCs), so anonymous access is unnecessary and flagged by the linter.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_subscription_tier(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_use_feature(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_payment_claim(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_payment_claim(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_referral_stats() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_live_leverage_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_leverage_admin_columns() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_leverage_admin_columns_insert() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_invite_code_columns() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_setup() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_tier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_use_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment_claim(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payment_claim(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_stats() TO authenticated, service_role;