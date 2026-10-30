# FinCRM — Approach & Audit Plan

### 1. Design Choices

I selected **React and TypeScript** for the frontend, **Node.js/Express with TypeScript** for the backend, **SQLite** for reproducible local testing, and **Neon PostgreSQL** for persistent hosted storage. This separates the user interface, application authorization, and database controls while supporting deployment on Render without relying on ephemeral database files.

Authentication uses **server-side sessions** with cryptographically random tokens, hashed session identifiers in the database, HttpOnly cookies, expiration, and server-side revocation at logout. I chose this approach over JWTs to simplify immediate session termination. Role-based access control (RBAC) is enforced on backend endpoints, not just through hidden frontend controls. The four roles are Admin, Manager, Analyst, and Viewer.

### 2. Security Thinking

- **Protect credentials:** Salted scrypt password hashing; passwords are never stored in plaintext.
- **Restrict access:** Authentication middleware, active-user checks, server-enforced RBAC, and denied-access audit events.
- **Protect sessions and requests:** HttpOnly and SameSite cookies, Secure cookies in production, session expiration/revocation, login rate limiting, trusted-origin validation, and API responses marked `Cache-Control: no-store`.
- **Preserve transaction accountability:** Customer creation, updates, and deactivation generate audit records containing the actor, action, affected record, outcome, and timestamp. Customer changes and corresponding audit inserts execute within a single database transaction.

These controls support selected **NIST CSF Protect and Detect** objectives and address access-control, logging, and change-accountability concepts relevant to the **FFIEC IT Handbook** and **SOX 404**. They do not establish regulatory compliance.

### 3. If I Were the Auditor

I would evaluate both **control design** and **operating effectiveness** through inspection, inquiry, and independent reperformance:

- **Authentication and sessions:** Verify password hashing, reject unauthenticated requests, log out, and attempt to reuse the revoked session.
- **Authorization:** Build a role-permission matrix and test allowed and prohibited operations, including direct API calls that bypass frontend restrictions.
- **Audit-log completeness:** Establish an independent population of customer create, update, and deactivate requests; reconcile each successful operation to exactly one audit record using the customer ID, user, action, outcome, and timestamp. Investigate missing, duplicate, or inconsistent entries. Test failed and denied operations separately.
- **Transaction integrity:** Deliberately cause an audit insert to fail and verify that the corresponding customer modification is rolled back.
- **Security monitoring:** Verify failed-login logging, login throttling, and rejection of requests with untrusted origins.

**Evidence obtained:** 26 automated SQLite tests passed, covering authentication, RBAC, audit attribution, expected event counts, database constraints, transaction rollback through the application helper, failed-login logging, rate limiting, and origin validation. Separately, I manually verified PostgreSQL login, customer creation, audit records, denied access, and logout revocation using API requests and Neon database inspection. These results demonstrate selected control behavior, not sustained production effectiveness.

### 4. Gaps and Further Improvements

- **Audit-log integrity:** SQLite and PostgreSQL audit records are not independently protected from privileged database modification. A production system should use restricted, centralized, tamper-resistant logging with retention and alerting.
- **Infrastructure:** Render HTTPS deployment, Neon persistence across redeployments, secure configuration, backups, and recovery procedures require verification.
- **Authentication and monitoring:** Add MFA, stronger CSRF protection, centralized rate limiting, security alerts, and session-management hardening.
- **Audit assurance:** Independently reconcile complete transaction populations to audit events, assess privileged database access, and test controls over a sustained period. Automated PostgreSQL integration coverage should also be added.

### 5. Use of AI

I used **ChatGPT and Copilot** to assist with architecture planning, implementation, troubleshooting, security-control analysis, test development, and documentation. I provided prompt directions, reviewed the generated code and design decisions against my instructions and expectations, ran the application locally, exercised role permissions, inspected database audit records, and executed automated tests. AI-assisted output was treated as a starting point requiring verification, not as evidence that a control worked.

**Conclusion:** FinCRM demonstrates selected preventive and detective application controls appropriate for a fictional financial institution. The tested controls functioned as expected, but further security, operational, and independent audit procedures would be required before production use.