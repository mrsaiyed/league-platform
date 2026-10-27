# 04 — Identity, permissions, security, and privacy

[Specification map](README.md) · Status: proposed release requirements · Decisions: D-09–D-10

**Detailed engineering contract:** [Security specification](engineering/05-security-and-privacy.md) defines runtime roles, RLS, action/field permissions, sessions, threat cases and data lifecycle.

## Identity and authorization

**SP-01 — Individual identity.** Use verified personal accounts; require MFA for privileged staff. Passwordless email is the starting recommendation, subject to provider/device review. Invitations bind intended person, workspace and scope, expire and become unusable after acceptance. A paid receipt, email domain or public player profile is not proof of guardian relationship, school eligibility, or staff authority. Participants entered by authorized managers may have no login until securely claimed.

**SP-02 — Permission expression.** Authorization requires identity, active access relationship, permitted action, resource scope, and valid workflow state. Presets initialize grants; a plan entitlement never grants record access. Revoke authoritative permissions promptly rather than relying entirely on stale token role claims. Protect the last owner and require verified acceptance of ownership transfer.

| Role                              | Default scope                                         | Sensitive restriction                                                      |
| --------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Participant / authorized guardian | Own permitted records / verified dependent            | No peer application access                                                 |
| Captain / team manager            | Assigned entry/roster and approved sports information | No automatic access to private finance or eligibility evidence             |
| Scorer                            | Assigned game and current scoring authority           | Submit result; final correction requires a separate grant                  |
| Eligibility reviewer              | Assigned cases and necessary evidence                 | Does not gain finance/content privileges                                   |
| Finance                           | Approved order/refund/report scope                    | No unrelated participant evidence                                          |
| Commissioner / owner              | Granted competition/workspace actions                 | Sensitive exports, finance and governing-policy exceptions remain explicit |
| Platform support                  | Temporary reasoned approved scope                     | Read-only default; no universal customer password                          |
| Integration principal             | Explicit machine scopes and approved objects          | Separate credentials, rotation and revocation                              |

## Threats and controls

**SP-03 — Isolation.** Enforce workspace and relationship scope in server commands, database grants/RLS, functions, caches, object storage, exports, realtime and background jobs. Validate every referenced ID, not just the route's parent ID. Review privileged execution paths and do not use unrestricted service credentials for normal user queries. Supabase's RLS guidance is a provider reference; our policies and negative tests establish the actual boundary. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

**SP-04 — Sessions and browser.** Choose a supported server/browser authentication flow; validate identity server-side, use secure cookie attributes appropriate to that flow, and document any client-readable token requirement. No extra token copies in analytics or application storage. Protect cookie mutations against CSRF, restrict redirects/CORS, apply CSP and clickjacking/MIME protections, require TLS, and reauthenticate high-impact actions. Timeout/recovery rules must preserve scorer work.

**SP-05 — Inputs and abuse.** Validate schemas, depth/size, rates, quotas and file contents server-side. Sanitize supported rich text; reject arbitrary script/embed code. Quarantine uploads, bound pixels/bytes, strip location metadata, scan where appropriate and create safe derivatives. Prevent SSRF through media/import URLs and formula execution in spreadsheet exports. Rate limits consider legitimate users behind a shared network. Bulk imports run staged previews with errors and authority checks.

**SP-06 — Privacy.** Classify fields as public-approved, private operational, restricted, or secret. Collect only needed information for an enabled workflow. Jurisdiction, participant ages, guardian consent, institution contracts, retention and publication requirements must be resolved for each supported market before accepting real data. No blanket assumption that all leagues are schools or that a school can authorize every use. Minors-specific behavior is an explicit preset/policy, not an unsupported checkbox or a permanent universal restriction on adult leagues.

**SP-07 — Publication and retention.** Names, photos and videos require the applicable authority and visibility policy; private contacts/payment/eligibility details are excluded. Maintain purpose/version/actor evidence and a withdrawal process. Define retention per class, requester verification, legal-hold handling, scoped exports, erasure propagation and backup expiry. Restore re-applies erasures/revocations before reopening service. A payer is not automatically entitled to the participant's private account.

**SP-08 — Audit and response.** Record actor, scope, action, target, time, command correlation, safe diff and reason. Do not indiscriminately store secrets or raw sensitive evidence in audit/logs. Application roles cannot rewrite audit; independent controlled copies strengthen investigation. Name incident owner/backup, containment and recovery procedures, and applicable notification process. Test owner recovery, access revocation, disclosure response and restore. No unqualified claim of compliance or security without evidence.

## Acceptance and specification completion

Test anonymous users, unrelated peers in one workspace, two tenants, revoked staff, guardians with changed authority, scoped scorers, private file paths, joins/functions, cached content and machine grants. Threat cases include ID swapping, forged role/amount fields, stale sessions, duplicate refunds, malicious media, and exports through support access.

The engineering security contract now specifies trust boundaries, DB roles/policy patterns, action/field permissions, session/MFA/recovery behavior, file controls and threat cases. Implementation must prove executable policies against actual roles, complete supported-market retention/consent decisions, rehearse incidents/deletion and obtain the required independent review.
