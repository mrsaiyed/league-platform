// Sign-in (T-6, T-14, T4 §3, records 013 and 018): the interface, the numbers and the
// return-address check every adapter shares, the Supabase adapter with the store it
// needs, and the local stand-in for development and tests only.
export type * from './sign-in-service.ts';
export { isAllowedReturnAddress, type ReturnAddressRules } from './return-address.ts';
export { signInDefaults, type SignInSettings } from './sign-in-settings.ts';
export { createSupabaseSignIn, type SupabaseSignInOptions } from './supabase/supabase-sign-in.ts';
export { SupabaseAuthUnexpected, type FetchLike } from './supabase/gotrue-client.ts';
export type * from './supabase/sign-in-store.ts';
export {
  createMemorySignInStore,
  type MemorySignInStoreOptions,
} from './supabase/memory-sign-in-store.ts';
export {
  createLocalSignInStandIn,
  localSignInDefaults,
  type LocalSignInOptions,
  type LocalSignInSettings,
  type LocalSignInStandIn,
} from './local/local-sign-in.ts';
export { createSignInCodeCapture, type SignInCodeCapture } from './local/code-capture.ts';
export type { AttemptLimits } from './sign-in-settings.ts';
export type { PasswordHash, PasswordHasher } from './local/password-hash.ts';
