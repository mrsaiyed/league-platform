# 04 - Security, privacy, and abuse prevention

> Historical snapshot: this prospective-client initiative is inactive. Use the [active overall product plan](../../../../product/platform/README.md) for current direction. Earlier approval/customer statements below retain their historical context.

Status: proposed production release requirements. The current demo implements none of these guarantees. Security is a property to verify across the application, database, providers, operations, and staff behavior; selecting a managed backend does not establish it.

## 1. Threat model and protected assets

| Threat                    | Example                                                        | Required control/evidence                                                                     |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Cross-organization access | Customer A swaps a game/registration ID for customer B's       | Scoped keys, API authorization, RLS, negative tests across read/write/export/realtime/storage |
| Access within same school | Player fetches another student's application                   | Relationship-based access independent of tenant membership                                    |
| Privilege escalation      | Captain sends `role=commissioner` or creates a role assignment | Server-managed permissions; grants limited by authority                                       |
| Account takeover          | Stolen staff session or reused credentials                     | MFA, secure recovery, session revocation, sensitive-action reauthentication                   |
| Payment manipulation      | Modified amount, forged success URL, duplicate refund          | Server pricing, signature verification, idempotency, balance reservation, reconciliation      |
| Score corruption          | Two tabs score concurrently; old offline device reconnects     | Single authority, fencing, revisions, immutable events, conflict recovery                     |
| Content/upload attack     | Script in custom form, SVG, media URL, import                  | Sanitization, allowlists, content validation, isolated processing                             |
| Data disclosure           | Email list in export/log/cache/social card                     | Field allowlists, recipient scope, redaction, private cache policy                            |
| Insider misuse            | Staff downloads all students without need                      | Least privilege, export permission, audit, support access expiry                              |
| Abuse/cost spike          | Bot registrations, repeated email sends, huge video uploads    | Quotas, rate limits, anti-abuse escalation, budget alerts                                     |
| Operational loss          | Deleted database/assets; faulty migration                      | Tested backups, release gates, restore runbook, independent copies                            |

**SEC-01 - Baseline.** Use a risk-mapped OWASP ASVS Level 2-oriented checklist for applicable controls, with each item implemented, deferred with justification, or not applicable. Do not advertise “ASVS certified” or “secure” as an unqualified guarantee. Record the exact standard version at review. [OWASP ASVS](https://owasp.org/projects/asvs).

## 2. Permission model

Authorization = authenticated identity + active membership/verified relationship + permission + resource scope + valid workflow state. An organization owner is not automatically entitled to all student data merely because they can edit the site's logo.

| Action                   | Player/verified guardian  | Captain                   | Assigned scorekeeper        | School reviewer          | Commissioner                    | Finance        | Platform support            |
| ------------------------ | ------------------------- | ------------------------- | --------------------------- | ------------------------ | ------------------------------- | -------------- | --------------------------- |
| Read public sports data  | Published                 | Published                 | Published                   | Published                | Published                       | Published      | Published                   |
| Read application/contact | Own/authorized child      | Own only                  | No                          | Eligibility subset       | Scoped operational need         | Payment subset | Temporary approved scope    |
| Decide eligibility       | No                        | No                        | No                          | Assigned scope           | If granted                      | No             | No by default               |
| See draft pool           | Own public details        | Approved pool fields      | No                          | No by default            | Yes                             | No             | Only support scope          |
| Record draft picks       | No                        | Read only in pilot        | No                          | No                       | Active host/delegate            | No             | No by default               |
| Enter game events        | No                        | No unless assigned scorer | Assigned game/current lease | No                       | Explicit scoring scope          | No             | No by default               |
| Finalize/correct         | No                        | No                        | Submit only by default      | No                       | Finalizer/correction permission | No             | No by default               |
| Request refunds          | Own request only          | Own request only          | No                          | No                       | Only if finance permission      | Yes            | Separate finance escalation |
| Publish names/photos     | Own submit; staff publish | No                        | No                          | As school policy permits | Consent-aware publisher         | No             | No by default               |
| Export private records   | Own permitted record      | No                        | No                          | Narrow permitted export  | Explicit export permission      | Finance export | Temporary audited scope     |
| Manage staff roles       | No                        | No                        | No                          | No                       | Owner/delegated subset          | No             | Owner recovery process only |

**SEC-02.** Launch with named presets and explicit scoped assignments; arbitrary custom-role editing can follow after the permission vocabulary stabilizes. A scorer's authority is game-specific. Revocation is checked by mutations against authoritative state, not only a long-lived JWT role claim.

**SEC-03.** Protect the last organization owner; ownership transfer requires acceptance by the new verified owner. Platform support uses separate identities and temporary grants with reason, expiry, and read-only default. Emergency access is logged and reviewed. No hidden universal customer password.

## 3. Tenant and database isolation

**SEC-04 - Layering.** Enforce tenant/resource scope in commands and database policies. Composite foreign keys prevent cross-tenant and cross-season references. Test object storage, private previews, imports, exports, Realtime, caches, and background jobs as well as ordinary APIs.

**SEC-05 - Database roles.** Application queries should not use table-owner/superuser/BYPASSRLS identity for ordinary requests. RLS is not a blanket defense for privileged roles: PostgreSQL owners normally bypass it, and superusers/BYPASSRLS roles do bypass it. Where applicable use forced RLS plus appropriate non-owner principals, explicit grants, and tested policies. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

**SEC-06 - Supabase exposure.** Enable RLS and intentionally grant operations for each exposed table/view/function. A publishable client key is not a private service credential. Service credentials stay on reviewed server/worker paths. Private financial/eligibility data does not enter anonymous schemas or broad public policies. Views/functions require their own execution-rights review. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

**SEC-07 - Policy tests.** Test anonymous, two players in one organization, two organizations, revoked staff, scoped scorekeeper, and platform worker identities. Verify selection, insertion, updates changing organization IDs, deletion, joins, RPC/function calls, bulk actions, and guessed file paths. A denied UI button is not authorization evidence.

## 4. Authentication, sessions, and browser security

**SEC-08.** Verify email before private account access. Bind invitations to intended identity/organization/scope; invitation tokens expire, are single-use, and are not persisted raw. Passwordless links/codes need throttling, expiry, generic account-discovery responses, and safe redirect allowlists. School domain verification does not grant commissioner access.

**SEC-09.** Privileged staff require MFA. Define recovery/revocation procedures for lost devices and departed staff. Proposed starting session policy: short inactivity timeout for admin/finance, fresh authentication for role grants, sensitive exports, owner recovery, and high-impact refunds; exact durations must be rehearsed for courtside use so active scoring does not lose data.

**SEC-10.** Choose and document one supported server/browser session pattern with Supabase SSR integration. Cookies controlled by our server use Secure and appropriate SameSite; use HttpOnly wherever the chosen flow permits. Never assume a JavaScript-readable token is HttpOnly or that a locally decoded JWT alone verifies identity. Validate identity/claims using supported server mechanisms. Do not copy tokens into application localStorage or analytics.

**SEC-11.** Protect cookie-authenticated mutations with origin checks and CSRF defense appropriate to the endpoint/framework. Restrict CORS, validate redirects and hostnames, use CSP with narrowly approved script/frame sources, prevent clickjacking, set MIME-sniffing/referrer protections, and require TLS. Server components/actions still need authorization.

**SEC-12.** Render safe text by default. Sanitize any approved rich text on the server. No arbitrary JavaScript/HTML in branding, announcement templates, custom fields, or embed codes. Escape spreadsheet export cells that could execute formulas.

## 5. School privacy and young participants

**PRI-01 - Classification.** Public: approved sports identity, team, schedule, finalized stats, approved media. Private operational: applications, contacts, verification, internal notes, payment metadata, consent evidence, attendance requiring restriction. Restricted: auth secrets, sensitive recovery evidence, privileged tokens, and any approved emergency/health information. Avoid collecting the last category beyond demonstrated need.

**PRI-02 - Legal applicability decision.** Before student collection, establish relevant jurisdictions, participant age handling, school contractual requirements, and applicable student/child privacy obligations. FERPA applies to qualifying educational agencies/institutions receiving U.S. Department of Education program funds; do not assume every private school has identical coverage. [U.S. Department of Education FERPA overview](https://studentprivacy.ed.gov/faq/what-ferpa).

COPPA analysis concerns under-13 users and the service's circumstances, not just the selected grade. School consent is limited to the authorized educational context and does not authorize unrelated commercial uses. Do not infer that a sports program automatically qualifies for every school-consent exception. Resolve the actual enrollment/guardian process before accepting a child whose required authorization is missing. [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).

These are engineering decision gates, not a legal compliance determination. The school agreement and qualified review must settle application to this service, including state requirements; the software must record the chosen policy and evidence.

**PRI-03 - Publication choices.** Capture separate authority for public name format, headshot, team photo, video, and optional promotional use as required by the approved policy. No prechecked consent. Withdrawal may limit publication without erasing legitimate game/financial records. Do not make optional marketing consent a hidden condition of playing.

**PRI-04 - Public exposure.** Never publish email, phone, exact birth date, school ID, guardian details, registration/payment/discipline status, eligibility evidence, or private notifications. Consider initials/approved display names as the default pending school decision. Avoid publishing personal future whereabouts beyond the approved league schedule.

**PRI-05 - Guardians.** A verified relationship can grant access to a child's application and schedule; a payer alone is not proven guardian. Define handling for multiple guardians, revoked authority, account recovery, and access disputes. For a verified teen self-service pathway, document school/guardian consent requirements separately.

**PRI-06 - No incidental data reuse.** No sale of student data, behavioral advertising, cross-organization player discovery, face recognition, or training models on private customer data in the initial product. Analytics uses aggregate operational events and minimal identifiers. External video embeds may send data to providers; disclose and configure appropriately.

## 6. Upload, import, and link controls

**SEC-13 - Files.** Proposed image limits: 10 MB upload, bounded pixel count, approved raster types. Detect file content rather than trusting extension/MIME. Decode/re-encode safe derivatives, strip EXIF/location data, generate server-owned keys, quarantine until validation/scan, and serve through appropriate content types. SVG/logo support needs dedicated sanitization or rasterization; do not render arbitrary active SVG uploads.

**SEC-14 - Storage.** Private bucket by default; signed URLs are scoped and short-lived. Published derivatives have distinct keys and deliberate access policy. Downloads recheck authorization. Backup and deletion must include originals, thumbnails, exports, and derivatives.

**SEC-15 - URLs.** Parse approved external video IDs and build provider URLs; block arbitrary server fetching to avoid SSRF. Custom-domain setup verifies ownership before routing/certificate activation and removes stale aliases safely.

**SEC-16 - Imports.** Stage CSV data, enforce size/row limits and schema, validate tenant references, display errors, and provide dry-run/idempotent import. Do not execute formulas, accept privileged fields, or import school-wide student datasets unnecessarily. Identity matching is explicit and reversible where feasible.

## 7. Audit, retention, and deletion

**SEC-17 - Audit events.** Capture actor, organization, scope, action, target, request correlation, time, safe diff, and reason for sensitive operations. Do not store passwords, tokens, card data, full webhook payloads, or private free-text indiscriminately. Application roles cannot update audit history. Periodic export to separately controlled immutable storage strengthens investigation; “append-only table” alone does not make administrator tampering impossible.

**PRI-07 - Retention schedule.** Before production, assign purpose, owner, retention period, deletion behavior, and legal-hold exception to each data class. Recommended starting discussion: short retention for incomplete applications and raw webhook/debug payloads; operational records through the season and dispute window; public season archive by school agreement; finance retention by applicable requirements. Exact periods are OPEN, not an arbitrary seven-year rule for everything.

**PRI-08 - Erasure workflow.** Verify requester authority, inventory linked data, separate required retained facts from deletable personal fields, unpublish/revoke media, cancel future deliveries, purge projections/exports, and record completion/remaining retention basis. Provide a machine-readable scoped export. Erasing a login must not corrupt result records or redirect account ownership to another person.

**PRI-09 - Backups.** Define how deletions persist through restore using a minimal retained erasure ledger and replay process. Disclose backup expiry; do not promise instant removal from every immutable backup. Restore into an isolated environment, apply relevant erasures/revocations, then reopen traffic.

## 8. Development and incident security

**SEC-18.** Store secrets in provider/environment secret managers; separate local, staging, and production credentials. CI gets minimum privileges and short-lived cloud identity where supported. Scan secrets/dependencies, pin tools/actions, remove abandoned packages, and rotate exposed secrets. Never put production student data in screenshots, test fixtures, preview builds, or support logs.

**SEC-19.** Rate limit auth, registration, checkout creation, exports, uploads, messages, and expensive schedule generation by relevant identity/tenant/IP dimensions. Add challenge/abuse review when triggered; avoid blocking a whole school behind one shared IP without considering legitimate bursts.

**SEC-20.** Create incident procedures for suspected data disclosure, stolen staff credentials, fraudulent refunds, corrupted results, and provider outages. Name incident commander and backup, preserve evidence, contain access, rotate credentials where needed, assess scope, restore service, and follow the contractual/legal notification process. Rehearse before launch. Do not invent a legally universal notification deadline.

## 9. Security release evidence

- Threat model and data-flow diagram reviewed; named owners for unresolved risks.
- Automated tenant and same-tenant relationship tests pass using production-like database roles.
- Staff MFA, revocation, invitation, and account recovery are rehearsed.
- Payment forgery, duplicate events/refunds, and mismatched amounts are rejected.
- Private images/exports cannot be fetched through public paths or another tenant's session.
- Public HTML/JSON/cache/metadata contains only approved fields.
- Restore, deletion, incident, and scorer-conflict procedures work in staging.
- Independent review of authentication, RLS/grants/functions, payments, and scorer concurrency before production collection; assessor and budget are OPEN.

## 10. Delegated institutions and integrations

**SEC-21 - Delegated authority.** Federation/regional/district/school roles are scoped assignments, not automatic powers inherited from a display tree. Distinguish authority to set competition policy from permission to read student evidence, issue a refund, change a result, or manage staff. A school representative may submit/update its entry within a host competition without gaining host-wide membership powers. Delegations have grantor, permitted actions/resources, effective/expiry times, and revocation. Cycles and grants exceeding the grantor's authority are rejected. Test sibling schools, parallel districts, officials with multiple assignments, transfers, and revoked affiliations. Composite keys remain enforced in cross-workspace bridge transactions.

**SEC-22 - Shared data and mandatory policy.** A host competition receives only approved fields and eligibility assertions/evidence authorized for that purpose. Record source, recipient, agreement/purpose, consent or other approved authority where applicable, field set, and retention. Withdrawing affiliation stops future sharing and access according to policy, while required historic result/evidence retention is explicitly addressed. Sharing does not erase source ownership or imply a global athlete directory. Applicable governing policies can lock rule fields; local customization cannot override them. An exception/appeal follows the authority of that specific policy and a recorded decision, not an unrestricted admin toggle.

**SEC-23 - Enterprise identity and machines.** Before enterprise integrations, design tenant-bound SSO, account linking, lifecycle/provisioning, MFA equivalence, recovery, and emergency access. Domain ownership alone does not authorize merging accounts or granting institutional authority. Service principals are independently scoped, rotated, rate-limited, audited, and revocable; credentials are never embedded in a customer's theme. API grants, directory groups, and federation roles must map to reviewed resource permissions. Enterprise SSO, directory provisioning, customer-specific encryption/residency commitments, and compliance attestations are unimplemented until separately reviewed and tested.
