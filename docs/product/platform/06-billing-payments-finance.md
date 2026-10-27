# 06 — Billing, payments, and finance

[Specification map](README.md) · Status: proposed finance contract · Decisions: D-03–D-04, D-13–D-14

**Detailed engineering contract:** [API and transaction specification](engineering/04-api-and-transactions.md) defines durable checkout, verified webhook processing, refund reservation and reconciliation; [database fields](engineering/02-database-and-integrity.md) define the records.

## Money and responsibility

**FN-01 — Separate ledgers and subjects.** Platform subscription/season invoices, league participation/team fees, ongoing membership dues, and optional implementation services are different revenue streams. Orders identify legal seller, payer, beneficiary, provider account, currency and billable subject. The platform is not assumed to collect every league's money as its own revenue. No fixed student price or school-service package is a platform default.

**FN-02 — Merchant readiness.** Use a supported payment-provider marketplace/connected-account arrangement for independent organizers, with readiness/capability restrictions checked before paid enrollment. Hosted checkout is proposed to avoid direct card handling. Determine charge flow, settlement, fees, disputes, refunds, account restrictions and supported countries before live collection. Charge type affects which account bears particular liabilities; do not choose it from UI convenience. [Stripe Connect charge types](https://docs.stripe.com/connect/charges).

**FN-03 — Modes.** Support no participation fee, payment with application, payment after offer/acceptance, and authorized external/offline-payment recording when each is tested. No-fee, waived, externally recorded and processor-confirmed are distinct facts. A free league can still owe a separately disclosed platform subscription. Team-fee allocation and refund do not automatically follow each player's withdrawal. Installments, multi-party splits, taxes/invoicing across jurisdictions and recurring sporting dues require separate policy and provider review.

## Transaction and recovery contract

1. Server prices the approved order items using immutable price/discount/fee/policy snapshots and integer minor units. Reject browser-supplied authoritative amount/currency/merchant.
2. Persist an order and stable idempotent payment attempt before provider interaction. Retries recover an uncertain outcome rather than inventing a new charge.
3. Verify webhook signatures on the raw request; durably record provider/account/event uniqueness before acknowledgment. Process through bounded retries and reconciliation.
4. Match provider object, seller account, expected amount and currency. A success redirect or UI state cannot establish payment. Delayed/reordered events cannot regress known financial facts.
5. Commit related application/admission changes under their capacity transaction. Record payment even if admission processing needs repair.

**FN-04 — Refunds.** Reserve refundable balance in a transaction, including existing pending refunds. Submit an idempotent provider request and expose requested/submitted/pending/succeeded/failed/needs-review states. Preserve original charge, fee, refund and dispute facts; never erase an order to reverse it. Unknown provider outcome requires reconciliation. Bulk waitlist refunds preview scope/exclusions and show individual outcomes.

**FN-05 — Reconciliation and access.** Compare provider collections/refunds/disputes to local records regularly and after restore. Alert on duplicates, paid-but-unallocated records, wrong amounts, old pending jobs and mismatches. Restrict finance exports and dispute evidence. A payer receives a receipt and appropriate payment access, not automatic ownership of participant data. Record deadlines and named responsibility for disputes and negative balances.

**FN-06 — Platform billing lifecycle.** Define trial, active, grace, limited, canceled, and archived states separately from sporting enrollment. Upgrades/downgrades change entitlements at disclosed effective times. Preserve readable history/export and avoid disabling an active scorer unexpectedly. Cancellation, outstanding invoices, tax documents and organizer offboarding need an explicit contract. No current provider price or profit margin is assumed.

## Acceptance and next detail

Test duplicate checkout requests, delayed success, invalid signature, amount/account mismatch, reordered events, concurrent partial refunds, provider timeout, restricted organizer account, canceled season, failed renewal, and restored database with newer provider activity. Complete each with one explainable financial outcome and an actionable recovery status.

The engineering API/data/security contracts now define order/attempt/refund fields, durable webhook handling, refund reservations, permission boundaries and reconciliation. Remaining release decisions are merchant/charge flow, currencies/regions, fees/refund liability, receipt/invoice requirements and SaaS plan transitions. Provider tests, finance runbooks and dated cost estimates must substantiate the chosen model.
