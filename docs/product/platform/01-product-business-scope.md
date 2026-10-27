# 01 — Product, business, and scope

[Specification map](README.md) · Status: proposed product brief · Decisions: D-01–D-04

**Detailed engineering contract:** [Engineering decisions and build gates](engineering/08-build-plan-and-evidence.md) translate the product boundaries into a delivery sequence.

## Purpose and users

The platform supplies the website, private operations tools, participant experience, and supported integrations through one maintained product. Customers own the operation and policies of their leagues within applicable constraints. Primary users are organizer/owner, competition administrator, team manager/captain, scorer, finance staff, participant, authorized guardian, and public viewer. Larger customers add institutional reviewers, officials, regional administrators, and integration operators.

**PB-01 — Shared product.** Normal onboarding must not require a code fork, a copied database schema, or developer-written customer pages. Customer differences are typed configuration, supported templates, modules, and integrations. Platform staff can assist setup, but self-service must exercise the same commands and ownership model.

**PB-02 — Separate parties.** Record software customer, contracting entity, league operator, participant-fee merchant, beneficiary, payer, participant, and support operator separately. Becoming an organizer does not automatically make our company the operator of their games or the seller of their participation fees.

**PB-03 — End-to-end boundary.** A supported league can go from setup through enrollment, team formation, scheduling, result recording, communication, publication, and archive. Real-world coaching, refereeing, facility hire, equipment, medical response, and media filming are not automatically supplied. Integrations can provide payment, email, video, identity, or scores while our product maintains clear workflow status and data authority.

## Proposed initial offer

Recommend a self-service basketball product for independent organizers, using generic synthetic scenarios to choose scope. Release only supported combinations:

- A public website and private organizer workspace, participant account area, and inbox.
- Individual applications or team entry; authorized invite/import paths; optional payment and eligibility review.
- Manual placement and a supported hosted draft; roster history.
- Round-robin and single-elimination presets, manual schedule editing, basic generation, and result publication.
- Final-score/box-score entry; live points/appearance/minutes after its own courtside gate passes.
- Configurable pages, media links, basic awards, and exportable season history.

This is a scope proposal to prioritize in D-02. A private alpha can test fewer workflows, but advertised capabilities must match release evidence. A customer requiring an unsupported combination receives a clear limit before payment or publication.

**PB-04 — Packaging.** Entitlements determine available modules and quotas; permissions determine who may access which record. They are independent. Pricing model, subscription versus per-season billing, trials, transaction fees, and premium modules are open. Do not hard-code a customer participation price, a single currency, or unlimited usage into the platform plan.

**PB-05 — Lifecycle.** Workspace states include provisioning, active, limited, suspended, and archived. Define read/write/export behavior for each. Billing delinquency has a disclosed grace/recovery policy; abuse suspension has a separate response process. Do not silently erase history or interrupt acknowledged game recording because a plan renewal failed.

**PB-06 — Request policy.** Classify requests as configuration, reusable feature/module, integration, or outside supported scope. Commissioned work needs acceptance, ownership/license, maintenance funding, and a supported lifetime. Track subscription margin separately from migration/custom-development work. Maintain one release path for the supported product.

## Success measures and validation

Measure time to first published league, setup completion, registration completion, games finalized without repair, support minutes per organization/season, retention, paid conversion, usage cost, and contribution margin. Collect minimal operational analytics; do not rely on profiling participants to make the business viable.

Acceptance: two unrelated organizers create visibly different leagues from the same product without source edits; their data stays isolated; both can export their records and understand what their plan includes. An organizer can run a free league without a participation-payment provider, subject to any separately disclosed platform subscription charge.

## Detail to settle next

Define the first buyer segment and supported workflow combinations; commercial terms and launch regions; support hours; trial/cancellation policy; entitlement/quota table; pricing hypotheses; analytics event dictionary; and onboarding success criteria. No specific prospective customer determines these defaults.

## PB-07 — Immediate delivery: team-managed game records

A team participating in an outside league can use the same platform's roster, fixture, game-operations, statistics and publication modules without becoming the league host. Its records are team-maintained; the governing league retains official schedule/result authority unless an explicit integration/delegation says otherwise. External opponents need not become customers or account holders.

The first implementation exercises this mode for Al-Hadi varsity; [the initiative](../../initiatives/alhadi-varsity/README.md) is a configuration and delivery context, not a separate product fork. Stats-first delivery precedes the broader proposed offer above. The full admin/site customization goal remains unchanged; no registration/payment/draft/editor requirement blocks this narrow rehearsal.
