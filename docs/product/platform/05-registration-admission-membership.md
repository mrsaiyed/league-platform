# 05 — Registration, admission, and membership

[Specification map](README.md) · Status: proposed workflow brief · Decisions: D-11–D-12

**Detailed engineering contract:** [API and transaction specification](engineering/04-api-and-transactions.md) defines state axes, capacity/offer locks, request contracts and late-payment handling.

## Configurable enrollment paths

**EN-01 — Modes.** Support individual application followed by placement, team application with roster submission, approved invitation, and staged administrative import as separately tested paths. Payment requirement, eligibility review and team formation are independent choices. No universal grade field, paid waitlist, school approval, draft or player login requirement. Explain supported combinations before an organizer publishes registration.

Self-service applicants verify an account, choose an eligible competition/participant, provide necessary details and acknowledgments, review disclosed terms, complete any required payment, and receive private status. A team manager submits a team subject and authorized roster details; personal consent still needs the correct actor. Imports do not bypass privacy or admission checks. Unsigned-in public pages remain readable according to publication policy.

**EN-02 — Forms and identity.** Version form definitions and accepted policies; use bounded typed fields and stable keys independent of labels. Do not collect birth dates, health records or identity documents simply because the builder supports fields. Duplicate person/application handling uses scoped identities and reviewed merges, not name matching. Guardian, payer and participant can differ. Multi-child accounts must not merge participants.

## Independent states

| Axis                  | Example states                                                                   | Rule                                                        |
| --------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Application           | draft, submitted, withdrawn, closed                                              | Closure preserves necessary history                         |
| Contact verification  | unverified, verified                                                             | Not proof of playing eligibility                            |
| Eligibility           | not_required, pending, needs_information, approved, rejected, expired            | Evidence/reason is private and policy-scoped                |
| Admission             | unallocated, offered, reserved, admitted, waitlisted, released                   | Transactional capacity and offer expiry                     |
| Financial requirement | not_required, due, processing, satisfied, partially_refunded, refunded, disputed | Derived from policy and records; no fake successful payment |
| Team placement        | not_applicable, unassigned, assigned, released                                   | Independent from payment and login                          |

Translate states into clear messages rather than presenting six unexplained labels. “Payment received; application under review” differs from “place confirmed.” Published capacity, priority and refund terms must match processing behavior.

**EN-03 — Admission policy.** Define capacity unit (teams/people), priority classes, eligibility gates, allocation order, offer acceptance, expiry, and exception authority. Each pool locks allocation transactions and uses unique active allocations. A payment-processing sequence is one possible disclosed ordering rule, not a universal first-come guarantee. Team and player capacity can both apply; enforce both without inconsistent partial admission.

**EN-04 — Waitlist and holds.** Support unpaid waiting as a distinct path; paid waiting requires explicit opt-in, disclosure, cap, cutoff and refund workflow before collection. Checkout holds have server expiry and are distinct from admission. Late successful payment reconciles to a valid place, disclosed waitlist or refund task without overfilling. Promotion respects eligibility, priority, current capacity and any acceptance deadline. Staff exceptions require authority and a reason.

**EN-05 — Eligibility and recurring membership.** Start with supported manual/self-declared verification policies where appropriate; additional credential/roster/identity providers are explicit integrations. Review decisions record policy, actor, evidence scope, outcome and expiry. Sporting membership and club affiliation can outlast a competition, while credentials and consent can expire independently. Renewal never automatically reuses expired eligibility evidence. Appeals and governing rules expand through section 12.

**EN-06 — Leaving and changing.** Define rejected application, withdrawal, transfer, cancellation, waitlist release, late entry and revoked eligibility. Finance changes may trigger roster review; they do not delete past scores. Preserve original answers plus permitted amendments. Bulk review/promotions show selected scope, consequences and per-record outcomes.

## Acceptance and next detail

Exercise two applicants claiming the final place; a free individual entry; a team submission with players lacking logins; late payment after a hold expires; two children sharing a guardian; priority promotion; and an eligibility change after games exist. Retry must not duplicate a person, place or charge.

The engineering API/data contracts now define state axes, field ownership, capacity/offer locking, timers, bounded inputs, errors and payment-expiry races. Implementation adds compiled per-mode forms, visual applicant/manager flows, import/merge/transfer detail and concurrency evidence. Required modes for the first public release are D-11; unsupported combinations remain visibly unavailable.
