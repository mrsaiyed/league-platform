// Sign-in (T-6, T-14, T4 §3, record 013): the interface, the return-address check
// every adapter uses, and the local stand-in for development and tests only. The
// Supabase adapter (step 1.15) joins them here.
export type * from './sign-in-service.ts';
export { isAllowedReturnAddress, type ReturnAddressRules } from './return-address.ts';
export {
  createLocalSignInStandIn,
  localSignInDefaults,
  type LocalSignInOptions,
  type LocalSignInSettings,
  type LocalSignInStandIn,
} from './local/local-sign-in.ts';
export { createSignInCodeCapture, type SignInCodeCapture } from './local/code-capture.ts';
export type { AttemptLimits } from './local/attempt-limiter.ts';
export type { PasswordHash, PasswordHasher } from './local/password-hash.ts';
