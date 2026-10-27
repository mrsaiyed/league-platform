# 05 — Security, authorization and privacy implementation

[Engineering map](README.md) · Refines SP-01–08, DM-06–07, AT-02, RQ-03

## E-SEC-01 — Trust boundaries and database roles

Untrusted inputs include browsers, route/host names, upload metadata, imported files, provider messages until verified, editor JSON and all customer-supplied IDs. Authenticated users remain untrusted for permission, price and ownership claims. Server code establishes a request context from validated identity and current records.

| Database role       | Allowed purpose                                                         | Prohibited                                                             |
| ------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Migration owner     | CI-controlled schema changes; owns application tables                   | Used by web/worker runtime                                             |
| Web runtime         | Explicit table/column grants and RLS; transaction-local request context | Superuser, `BYPASSRLS`, table ownership, schema/function creation      |
| Public reader       | Approved `published` tables/functions only, tenant/publication-filtered | Reading `app.person_private`, applications, orders, ACL or auth tables |
| Worker dispatcher   | Claim/update job control rows; not arbitrary business access            | Customer impersonation by editing request payload                      |
| Domain worker       | Narrow job-kind grants; scoped workspace/job context for business work  | Universal provider service-role key for normal queries                 |
| ACL evaluator owner | NOLOGIN role; narrowly granted reads of access/relationship tables      | General table ownership, arbitrary write privileges, network access    |
| Backup/operator     | Named operational access through controlled credentials                 | Browser use, shared everyday support login                             |

Use separate database credentials/pools where roles differ. Runtime roles cannot `SET ROLE` to owners or modify grants. Apply `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` on tenant application tables. Audit all bypass paths. PostgreSQL table owners and privileged roles can bypass normal RLS behavior; merely enabling policies is not sufficient. [PostgreSQL row-security reference](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

A pooled connection receives account/workspace/job context using parameterized `set_config(..., true)` **inside each transaction**, never session-wide `SET`. Commit/rollback clears it. Missing/invalid context denies access. Do not set identity from request JSON. A custom setting is a server-established context, not cryptographic proof: a compromised DB runtime credential or SQL injection could spoof it. Parameterized SQL, no raw query endpoint, restricted grants and credential isolation are required alongside RLS.

## E-SEC-02 — Authorization expression and scope model

An action is allowed only when all conditions hold:

```text
validated active account
AND valid assurance / reauthentication for the action
AND active direct grant or verified subject relationship
AND resource belongs to the requested workspace and allowed typed scope
AND required action is present (including field-sensitive subpermissions)
AND feature entitlement + enablement permit the capability
AND resource workflow state permits the operation
```

Scopes have typed parents: workspace → league → season → competition → entry/game. Grant inheritance follows the resource tree, not name matching. A game scorer assignment does not expose all other games in its league. No role can grant powers broader than its own authorized delegation range. Disallow wildcard client-supplied scopes. Prevent removing/demoting the last active owner; ownership transfer requires verified recipient acceptance and audit.

Persist permission grants as relational rows, not only JWT claims. Every write checks current authority within its transaction; use the shared/exclusive access guard described in section 02 to order writes against revocation. Auth tokens identify accounts/assurance; cached role claims are advisory UI data. Long-lived connections reauthorize when access revision changes; disconnected/revoked users cannot keep receiving restricted events.

## E-SEC-03 — Baseline permission and field matrix

Presets initialize permissions; custom roles select registered actions within the grantor's delegation authority. The UI shows a readable action/scope preview before saving. High-impact actions still require MFA/reauthentication even for the owner.

| Action / data                     | Participant / guardian             | Captain / manager                           | Scorer                      | Reviewer                              | Finance                                   | Commissioner / owner                   |
| --------------------------------- | ---------------------------------- | ------------------------------------------- | --------------------------- | ------------------------------------- | ----------------------------------------- | -------------------------------------- |
| Public approved names/results     | Public                             | Public                                      | Public                      | Public                                | Public                                    | Public                                 |
| Own/dependent application answers | Verified relationship              | None by default                             | None                        | Assigned review fields                | Billing fields only if separately granted | Explicit registration permission       |
| Private eligibility evidence      | Own permitted evidence             | None                                        | None                        | Assigned case only                    | None                                      | Separate restricted permission         |
| Approved draft player pool        | Own public profile                 | Assigned competition, allowed sports fields | None                        | As assigned                           | None                                      | Draft permission                       |
| Roster edit                       | No; request change                 | Assigned entry if delegated                 | No                          | No                                    | No                                        | Scoped roster permission               |
| Live scoring                      | No                                 | No by default                               | Assigned game/current lease | No                                    | No                                        | Only with score/takeover permission    |
| Finalize / correct result         | No                                 | No                                          | Submit only by default      | No                                    | No                                        | Separate finalize/correct actions      |
| Receipt/order details             | Payer/authorized relationship only | None by default                             | None                        | Payment-status badge only when needed | Assigned merchant/competition             | Finance permission required            |
| Refund / payout configuration     | No                                 | No                                          | No                          | No                                    | Separate refund/manage actions            | MFA and explicit financial actions     |
| Website/media edit                | No                                 | No by default                               | No                          | No                                    | No                                        | Content edit; publishing is separate   |
| Roles / sensitive export          | No                                 | No                                          | No                          | No by default                         | Scoped finance export                     | Delegation/owner guard and recent auth |

Guardianship has its own verification/status; school email or payment does not establish it. A person may have no account. Account claim requires proof and conflicts route to authorized review. An organizer cannot search a global hidden database of athletes merely because another tenant already stores the same email.

## E-SEC-04 — Database enforcement pattern

Policies combine a mandatory workspace boundary with a resource/family-specific permission or relationship condition. Use SELECT policies for reads and explicit INSERT/UPDATE `WITH CHECK` conditions for new ownership and state. Immutable workspace/parent fields are excluded from update grants or guarded by triggers; a permitted edit cannot move a record to another tenant.

Illustrative structure, omitting full helper implementations:

```sql
CREATE POLICY application_workspace_boundary ON app.applications
  AS RESTRICTIVE FOR ALL TO web_runtime
  USING (workspace_id = app.current_workspace_id())
  WITH CHECK (workspace_id = app.current_workspace_id());

CREATE POLICY application_read_authority ON app.applications
  FOR SELECT TO web_runtime
  USING (app.may_read_application(
    workspace_id, competition_id, person_id, submitted_by));
```

The restrictive boundary alone grants nothing; a reviewed permissive operation policy is also required. `may_read_application` checks current grant/subject relationship and returns only a boolean. Supply the row's relevant ownership/relationship fields so the helper does not recursively query the same protected applications table. Team-manager subject access requires its own verified team relationship condition. Helpers that need privileged ACL access have a dedicated NOLOGIN owner, fixed `search_path`, fully qualified object names, no dynamic SQL and revoked PUBLIC execution. Grant execution only to the intended runtime role. ACL-table policies explicitly allow that evaluator's limited reads to avoid recursive policies; it gains no blanket bypass on business tables. Unit tests cannot prove this—run database tests as each actual role.

RLS is row filtering, not field redaction. Separate private/restricted tables and explicit column grants/DTOs enforce field sensitivity. In particular, application answers and eligibility evidence have separate policies from an application's status row. The shared web database role cannot use static column grants alone to distinguish every end-user role; relationship policies on these split tables and server DTO authorization both remain necessary. Public projections are separate allowlisted data. Any view/function must have reviewed invoker/definer behavior. An application role cannot bypass policies through a convenience view, join, RPC or storage helper. Do not expose PostgREST access to these schemas to compensate for missing API routes.

## E-SEC-05 — Authentication, sessions and recovery

Proposed first provider: Supabase Auth with a tested supported SSR/PKCE flow. Default sign-in is email link/OTP; staff enroll provider-supported MFA. Pin client/server SDK versions together and test refresh across browser tabs and server-rendered requests. Server validates the presented identity with the supported verification method; never trust client session JSON alone.

Use TLS, host-only cookies on the canonical app domain, Secure and appropriate SameSite settings. The Supabase SSR browser flow may require client-readable token cookies; do not claim those cookies are HttpOnly when they are not. Avoid extra token copies in application localStorage/logs, and do not issue session cookies for customer domains. Authenticated or token-refresh responses are never publicly cached. [Supabase SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Proposed session policy: refresh token handling follows provider rotation; privileged writes require `aal2`; ownership, bank/merchant changes, restricted exports and large/refund actions require a fresh authentication/MFA check within 15 minutes. A 30-minute idle warning may lock the staff UI, but cannot silently discard pending scorer events. Server authorization still governs every reconnect/write. Exact provider-supported revocation and assurance behavior is an implementation spike gate.

Mutations with cookies require same-origin validation and CSRF protection using a session-bound token. CORS is denied except explicit integration origins where needed; never reflect arbitrary credentialed origins. Redirect targets are normalized relative paths or exact allowlisted origins. Email token links are single-use/expiring according to provider flow; invitation acceptance additionally checks intended verified email and invite status.

Revoke roles immediately in the database. Account compromise also revokes provider sessions, blocks local account access and terminates restricted realtime delivery. Short-lived access tokens alone are insufficient for immediate role revocation. Recovery requires verified account control; support cannot grant ownership because someone knows a league name. Require a documented break-glass process with two-person review when normal owner recovery fails.

## E-SEC-06 — Browser, file and external-content controls

Use a tested CSP with nonce/hash-based script policy and minimal `connect-src`, `img-src` and `frame-src`; no arbitrary tenant script injection. Set `frame-ancestors`, HSTS after domain/TLS validation, MIME sniffing prevention and a restrictive referrer policy. Review provider checkout/auth/media requirements before enforcing CSP; do not disable protection globally when one embed fails.

Render rich text from a limited structured AST; links permit reviewed schemes, escape text and use safe external-link behavior. Video entries store approved provider plus video ID and construct embeds internally. Remote URL imports, if supported, defend against private/link-local IPs, DNS rebinding, redirects and excessive downloads. Prefer direct uploads/provider IDs initially to eliminate unnecessary server fetching.

Upload flow: authorize purpose/size/type → create random private object path scoped to workspace → short-lived upload URL → completion request verifies actual stored bytes → inspect magic bytes/MIME, dimensions and decode → quarantine/scan where appropriate → strip metadata and re-encode raster derivative → authorize public publication. Suggested initial image limit: 10 MiB, 40 megapixels, JPEG/PNG/WebP only; no customer SVG/HTML in the first upload path. Logos needing SVG can enter only through a reviewed sanitization pipeline later. Original private storage is never made public by merely changing a client flag. Revocable person-bearing derivatives stay in a private origin bucket and are served through a controlled media route/CDN that checks current publication state on origin reads; do not expose a permanent raw public-bucket URL. Static non-personal platform artwork can use separate long-lived caching.

Private download authorization rechecks current relationship; URLs expire in at most five minutes. Public withdrawal immediately denies new origin reads and invalidates page references; priority jobs purge CDN and derivatives, with a proposed maximum 60-second shared-cache lifetime for person-bearing content and no stale-on-error serving after expiry. Record purge completion and alert on failure. This bounds platform-controlled stale visibility; it does not instantly erase already cached/downloaded third-party copies. Private signed URLs can remain usable until their stated expiry unless the object is revoked/deleted through the storage provider. File names, EXIF location, storage keys and error messages must not leak personal information.

## E-SEC-07 — Threat cases and required evidence

| Attack / failure                                   | Required control and test                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tenant ID substitution in route or child resource  | Composite FK + server check + RLS; test every referenced ID, including bulk items                   |
| Same-tenant participant reads a peer's application | Relationship policy and private DTO; test both IDs under same workspace                             |
| Role escalates itself through custom-role editor   | Delegation bound and protected owner actions; reject ungrantable permissions                        |
| Old token after role/guardian revocation           | Live authorization/access guard, revoked realtime subscription; queued commands fail                |
| Mass assignment of `paid`, `workspaceId`, `role`   | Strict command schema and server-derived sensitive values                                           |
| Malicious page block or media URL                  | Registry/schema/sanitization and embed allowlist; no eval/dynamic customer imports                  |
| Cross-user cache content                           | Separate public/private clients, no-store, tenant/revision keys; cached-response identity tests     |
| Duplicate/out-of-order webhook/refund              | Verified durable inbox, unique IDs, state reconciliation, refund reservation race test              |
| Stolen scoring lease                               | Account + session + epoch + expiry checks; stale replay rejected                                    |
| Worker reused for another tenant                   | Server-resolved job scope, constrained handler/DB role; payload spoof test                          |
| SQL injection / database context spoof             | Parameterized queries, allowlisted identifiers, restricted credentials; raw SQL endpoint prohibited |
| Spreadsheet formula injection                      | Export escaping plus explicit numeric formats; malicious names/form fields fixture                  |
| Support overreach                                  | Time-bound scoped grant, reason, approval and audit; deny private evidence by default               |
| Logging sensitive input                            | Typed redaction; canary email/token/card-like values absent from logs/error reporting               |
| Restore resurrects removed public data             | Deletion/withdrawal ledger replay before service reopen                                             |

## E-SEC-08 — Data lifecycle and retention

Classify each field as public-approved, private operational, restricted or secret. Log schemas and export schemas name their permitted fields. Add a classification review when introducing a new field; never automatically include it in analytics, audit diffs or public DTOs.

Proposed technical defaults, subject to supported-market/contract policy: temporary uploads 24 hours; expired private exports 24 hours; raw webhook bodies 7 days if needed for diagnosis, with normalized financial evidence retained separately; routine application logs 30 days; security/audit searchable history 365 days with controlled archive where required; ordinary command receipts 30 days; worker success details 30 days. Personal applications, consent, official sporting history and financial evidence require explicit policy by record class before real collection—do not apply one universal “delete after X days” or indefinite retention.

Privacy workflow: verify requester → resolve owned/related records → identify retention/legal-hold exceptions → create deletion plan → withdraw public access first → execute bounded idempotent deletion/redaction across DB, files, projections, search, cache and providers → record non-sensitive completion evidence. A legal hold is restricted and audited; it cannot be an informal excuse to retain everything. Export gives only authorized tenant/subject data, including meaningful provenance/status descriptions.

Maintain a separate recovery-safe ledger of deletion/withdrawal obligations with minimal identifiers and expiry. Restored backups must replay this ledger before publication. Backup copies expire under the documented schedule; do not promise instant deletion from immutable recovery media. Market-specific rules for minors, school records, consent and cross-border storage remain a launch decision backed by appropriate review, not a generic compliance claim.

## E-SEC-09 — Secrets, support and release security

Store secrets in deployment secret management; `.env.example` lists names and purposes only. Separate development/staging/production credentials and provider accounts. Preview environments use synthetic records. Validate required environment variables at startup and fail closed without logging values. Client-exposed variables have an explicit allowlist; code review catches accidental public prefixes.

Rotate compromised keys immediately; rehearse provider/database/webhook rotation with overlap where supported. Use least-privilege CI deploy identities, pinned action versions, dependency lockfiles, vulnerability/secret scanning and branch protection. High/critical relevant findings block release unless a documented mitigation and owner/date justify a temporary exception. Do not promise that a scanner proves security.

Support uses a dedicated console with named staff accounts, MFA, expiring customer/scope grants, reason and ticket correlation. Default read-only, redact restricted data, and show impersonation/support banners when viewing permitted context. Writes require the same domain commands and attributable support actor; no universal customer password or direct unlogged SQL fixes. Maintain an incident runbook for containment, credential revocation, evidence preservation, impact assessment, recovery and applicable notifications; assign real owners before launch.
