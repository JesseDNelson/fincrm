# FinCRM

A security-focused CRM demonstration for a fictional U.S. financial institution. FinCRM combines customer management with authentication, role-based authorization, audit trails, and transaction-integrity controls. It was built as a software engineering and IT audit exercise, not as a production banking system. Use synthetic customer information only.

**Live demo:** https://fincrm-jmr2.onrender.com/

**Audit approach:** [One-page Approach & Audit Plan](docs/IT_AUDIT_PLAN.md)

## Architecture and design choices

FinCRM uses a React, TypeScript, and Vite frontend and a Node.js, Express, and TypeScript API. Separating the interface from the backend makes it easier to enforce security controls at the API boundary rather than relying on hidden buttons or client-side checks. The backend supports SQLite via Node.js `node:sqlite` for local development and automated testing, and Neon PostgreSQL for persistent hosted storage. Setting `DATABASE_URL` selects PostgreSQL; otherwise, the application uses SQLite. In production, Express serves the built React frontend and API from one origin.

Authentication uses salted scrypt password hashes and database-backed sessions, rather than JWTs. On login, the server issues a cryptographically random token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 hash is stored in the database. Sessions expire after eight hours and are revoked on logout. The cookie is marked Secure in production mode. Server-side authorization middleware checks the authenticated user's role on every protected customer operation, so bypassing the React interface does not bypass permissions.

Customer creation, updates, and deactivation use database transactions that write the customer change and its corresponding audit event atomically. The audit trail records the actor, action, entity, outcome, and timestamp; denied operations and failed logins are also recorded. These controls demonstrate selected concepts relevant to SOX 404, the FFIEC IT Handbook, and NIST CSF Protect/Detect. They do not establish regulatory compliance or production readiness.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | SQLite (local/tests); Neon PostgreSQL (hosted) |
| Authentication | Scrypt password hashing; database-backed sessions |
| Testing | Node.js built-in test runner; API and database tests |
| Hosting | Render (deployment pending) |

## Features and role permissions

Authenticated users can view and search customers. Authorized roles can create customers, edit names and email addresses, and deactivate customers without deleting their records. Customers include unique IDs and email addresses, status, creator/updater IDs, and timestamps. Backend validation and database constraints enforce basic data integrity.

| Action | Admin | Manager | Analyst | Viewer |
|---|---|---|---|---|
| View/search customers | Yes | Yes | Yes | Yes |
| Create customers | Yes | Yes | Yes | No |
| Edit customers | Yes | Yes | Yes | No |
| Deactivate customers | Yes | Yes | No | No |

**Security controls:** Salted scrypt hashes; random session tokens with hashed storage; HttpOnly/SameSite cookies; Secure cookies in production; session expiry and logout revocation; server-side RBAC; failed-login throttling (five failures within 15 minutes per IP, then HTTP 429); trusted-origin checks for modifying requests; `Cache-Control: no-store` on API responses; audit events for successful customer modifications, role-based denials, and invalid logins; and atomic customer/audit writes.

## Demo accounts

These credentials are intentionally public and for the fictional demo only. Never reuse them for real accounts or environments containing sensitive data.

| Username | Role | Demo password |
|---|---|---|
| admin | Admin | `FinCRM-Demo-Admin-2026!` |
| manager | Manager | `FinCRM-Demo-Manager-2026!` |
| analyst | Analyst | `FinCRM-Demo-Analyst-2026!` |
| viewer | Viewer | `FinCRM-Demo-Viewer-2026!` |

The hosted demo uses these credentials after the database is seeded. For local development, use the same values in `server/.env` if you want the documented demo logins to work. Changing `.env` does not update passwords of already-seeded users.

## Run locally

Prerequisites: Node.js 24, npm, and Git.

1. Clone the repository:

   ```bash
   git clone https://github.com/JesseDNelson/fincrm.git
   cd fincrm
   ```

2. Install backend dependencies and create `server/.env` (do not commit it):

   ```bash
   cd server
   npm install
   ```

   ```dotenv
   SEED_ADMIN_PASSWORD=FinCRM-Demo-Admin-2026!
   SEED_MANAGER_PASSWORD=FinCRM-Demo-Manager-2026!
   SEED_ANALYST_PASSWORD=FinCRM-Demo-Analyst-2026!
   SEED_VIEWER_PASSWORD=FinCRM-Demo-Viewer-2026!
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
   ```

   The seed script requires distinct passwords and skips existing accounts rather than replacing their hashes.

3. Initialize the SQLite database and start the API from `server/`:

   ```bash
   node --env-file=.env --import tsx src/seed.ts
   npm run dev
   ```

   API: http://localhost:3000 · Health check: http://localhost:3000/api/health (returns `{"status":"ok"}`). The default database file is `server/fincrm.db`; `FINCRM_DB_PATH` can override its location.

4. In a second terminal, start the frontend:

   ```bash
   cd client
   npm install
   npm run dev
   ```

   Open http://localhost:5173 and sign in with a demo account. Vite proxies `/api` requests to the local Express server.

**Optional PostgreSQL setup:** Add your private Neon `DATABASE_URL` to `server/.env`, then run these commands from `server/`:

```bash
node --env-file=.env --import tsx src/init-postgres.ts
node --env-file=.env --import tsx src/postgres-seed.ts
node --env-file=.env --import tsx src/index.ts
```

Do not commit the connection string. SQLite and PostgreSQL maintain separate data.

## API endpoints

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/health` | Public health check |
| POST | `/api/auth/login` | Public login; rate limited |
| GET | `/api/auth/me` | Authenticated user |
| POST | `/api/auth/logout` | End current session |
| GET | `/api/customers` | All authenticated roles |
| POST | `/api/customers` | Admin, Manager, Analyst |
| PATCH | `/api/customers/:id` | Admin, Manager, Analyst |
| PATCH | `/api/customers/:id/deactivate` | Admin, Manager |

Unauthenticated requests to protected routes return HTTP 401; insufficient role permissions return HTTP 403. An untrusted Origin on a modifying request also returns HTTP 403. Repeated failed logins can return HTTP 429.

## Testing and audit evidence

From `server/`:

```bash
npm run build
npm test
npm run test:coverage
```

**Latest verified automated result:** 26 tests passed, 0 failed. The automated suite uses SQLite and covers password hashing, database constraints, authentication, session revocation, role restrictions, customer changes, audit attribution and event counts, failed-login logging, origin checks, login throttling, and transaction commit/rollback. API tests use an isolated temporary SQLite database so they do not modify the normal local demo data.

**PostgreSQL verification:** Manually confirmed admin login, customer retrieval and creation, audit records in Neon, viewer access denial with a corresponding audit record, session revocation after logout, and the React production build loading customer data through Express.

Relevant evidence is in `server/tests/api/auth.test.ts`, `server/tests/auth/password.test.ts`, `server/tests/database/db.test.ts`, and `server/tests/database/transaction.test.ts`. See [Approach & Audit Plan](docs/IT_AUDIT_PLAN.md) for proposed audit procedures, completeness testing, and control limitations.

## Limitations and production considerations

FinCRM is a demonstration, not a hardened banking application. Audit logs are stored in the application database and are not independently tamper-resistant. The in-memory login limiter is not shared across multiple server instances; trusted-origin validation allows requests without an Origin header and is not a complete CSRF defense. There is no MFA, enterprise SSO, centralized security monitoring, alerting, managed secrets integration, or formal penetration test. The automated suite primarily tests SQLite; selected PostgreSQL workflows were verified manually.

The hosted application will use Render HTTPS and Neon PostgreSQL so customer data is not dependent on Render's ephemeral filesystem. Live deployment, HTTPS configuration, and persistence across redeployments remain to be verified. Use fictional data and the published demo accounts only.

## Project layout

- `client/` — React frontend and Vite configuration
- `server/src/` — Express API, authentication, RBAC, customer logic, audit logging, transactions, and SQLite/PostgreSQL schemas
- `server/tests/` — Automated API, password, database, and transaction tests
- `docs/IT_AUDIT_PLAN.md` — One-page approach and audit plan

## AI use

ChatGPT and Copilot assisted with architecture planning, implementation, debugging, control assessment, test development, and documentation. The generated work was reviewed and checked through local application use, database inspection, and automated tests. AI-generated suggestions were not treated as proof that a control worked.