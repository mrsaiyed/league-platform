# 12 — Scale, governance, and enterprise

[Specification map](README.md) · Status: expansion architecture brief · Decisions: D-27–D-29

**Detailed engineering contract:** [Capacity specification](engineering/07-capacity-delivery-operations.md) separates many-tenant and large-tenant workloads; [build plan](engineering/08-build-plan-and-evidence.md) distinguishes foundations from later enterprise features.

## Larger-product boundary

The target includes multi-program operators, affiliated networks and governing bodies. These customers introduce new workflows and authority models as well as larger traffic. This section defines contracts to preserve early and later capabilities to implement before selling them. No specific institution, jurisdiction or rulebook is assumed.

**EG-01 — Delegation.** Administrative units may form a bounded validated hierarchy. Roles are scoped grants with permitted actions/resources, issuer, effective/expiry times and revocation. Tree location alone grants no private-data access. Institutions may be local records or independently owned workspaces. A host receives approved competition snapshots/eligibility assertions through a sharing agreement; it does not inherit all member billing/contact/evidence records. Test sibling institutions and mixed local/external ownership.

**EG-02 — Governance policy.** Rules identify issuer, applicability, version, effective dates and locally editable/locked fields. Local customization obeys mandatory constraints; conflicts require resolution before publication. An exception is granted by the relevant authority with a reason and evidence. Classification/alignment is versioned by program/sport/time; future reassignment does not rewrite past results. Qualification links have a source official revision, destination entry and downstream-lock behavior.

**EG-03 — Institutional workflows.** Membership renewal, credentials, transfer restrictions, eligibility reviews, disciplinary outcomes and appeals require case states, assigned authorities, deadlines, restricted evidence, history and visibility policy. Import authoritative determinations with provenance where appropriate. Do not assume collecting all underlying academic/medical data is necessary. Officials can need certification, availability, assignment acceptance, replacement and separate compensation. Each capability requires jurisdiction/customer discovery and its own acceptance contract.

**EG-04 — Identity and integrations.** Enterprise SSO/directory provisioning needs tenant-bound trust, account-linking review, MFA equivalence, departure/revocation, break-glass recovery and machine scopes. Domain ownership alone is insufficient authority. Imported rosters/results/eligibility need source-of-truth and conflict rules. Contracted APIs, event feeds, exports and migration are part of procurement readiness, not undocumented scripts using a commissioner's session.

## Workload and deployment planning

**EG-05 — Measure structural and traffic scale separately.** A small synthetic regional hierarchy tests permissions/qualification but proves no statewide throughput. Load tests must cover both one large workspace and many small customers. Specify participants, teams, entries, retained seasons/events, concurrent scorers/admins, writes/second, public fanout, imports/exports, qualification recomputation, notification bursts and recovery volume.

Proposed progression: small two-tenant rehearsal; multi-competition operator; network fixture with delegated administrators; then measured large-workload profiles based on actual intended service commitments. Avoid invented customer-count forecasts. Collect p95/p99, error/lock rates, connection usage, queue lag and cost. Optimize indexed queries, projections and bounded jobs before adding operational complexity.

**EG-06 — Deployment evolution.** The shared codebase can support higher managed capacity, dedicated workers, controlled public caches, replicas or partitioning when justified. A contracted isolated database/deployment tier may be appropriate for residency/isolation needs, using the same migrations and supported upgrade path. Evaluate cost, restore, release coordination, observability and support; this is not a license for customer-specific code branches. Multi-region writes are a separate consistency project.

**EG-07 — Enterprise gate.** Before commitment, settle institutional scope, supported sports/rules, migration/cutover, identity/integrations, data responsibilities/region/retention, security/accessibility evidence, peak-event staffing, incident notification, service levels/remedies, billing and exit. Certifications and contractual guarantees require actual evidence. Price ongoing integration and custom-module maintenance explicitly.

## Acceptance and next detail

Use a synthetic host, two regions, several districts and member institutions with different permissions. Test expired affiliations, conflicting mandatory policy, appeals, updated alignment, qualification correction after downstream play, and source-feed conflicts. Separately run failure/restore and load tests at the proposed contractual envelope.

The engineering package now defines workload profiles, capacity budgets and early ownership boundaries. Future institutional releases still require federation ownership/authority contracts, affiliation/data-sharing schemas, case/appeal workflows, SSO/integration contracts, migration evidence and enterprise staffing/cost terms. Preserve these boundaries now; implement each expansion through validated demand and readiness gates.
