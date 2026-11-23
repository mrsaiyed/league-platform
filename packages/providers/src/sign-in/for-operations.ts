// For operations scripts only, never for the product: the Supabase adapter's own client,
// which holds the secret key and can remove a user. scripts/check-sign-in-service.mjs
// (step 2.206) imports it from here by path, to ask every call the adapter makes. It is
// kept out of this module's index.ts on purpose, so no app can import it: an app reaches
// a package only through its index (T-22), and nothing in the product removes a user.
export { createGoTrueClient, type GoTrueClient } from './supabase/gotrue-client.ts';
