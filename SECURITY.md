# Security boundary

This repository currently ships an offline presentation concept, not a secure league application.

- Anyone opening the demo can view every fictional persona, including the commissioner. There is no real login or access boundary.
- Browser storage holds only demonstration state. Do not enter real student, payer, medical, or school records.
- Payment, email, eligibility, publication, and account actions are simulations. There are no production provider credentials.
- A private source repository does not automatically make a hosted demo private. Verify hosting access independently.
- Report concerns privately to the repository owner rather than posting student data, credentials, or sensitive details in a public issue.

Before handling real users, implement the production design: verified identity, scoped memberships, server-side authorization, database policies and constraints, secure sessions, minimal public projections, provider validation, secret management, audit history, retention, and tested recovery. Follow the account and notification addendum for recipient-level privacy.

Keep `.env` files and secrets out of version control. If a secret is ever committed, revoke/rotate it and follow a deliberate incident process; removing the current file alone is insufficient.
