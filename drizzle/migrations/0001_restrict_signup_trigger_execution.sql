REVOKE ALL ON FUNCTION public.handle_wallet_signup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_wallet_signup() TO service_role;