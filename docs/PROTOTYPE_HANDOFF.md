# Stock Supplies Module 01 prototype handoff

## What this prototype demonstrates

Stock Supplies is a high-fidelity, clickable frontend prototype for the current module, **Marketplace Profitability & Analytics**. It demonstrates public acquisition, permissive prototype authentication, guided onboarding, governed financial operations, tenant administration, Tenth Tech Platform Administration, responsive layouts, role/access states, scenario states, and Light/Dark/System application themes.

All data and external-system behaviour are mocked. The prototype is intended for UX review and developer orientation, not production use.

## Domain model

The SaaS hierarchy is:

**Platform → Organisation → Company → Marketplace Account → Products / Marketplace Listings**

- An Organisation is the tenant boundary.
- A Company is the legal/reporting owner of internal Products.
- Marketplace Accounts belong to Companies and connect Amazon, eBay, or Temu activity.
- A Product is the Company-owned canonical catalogue item. Marketplace Listings map channel-specific SKUs and identifiers back to that Product.
- Product names can repeat; Company context and internal SKU provide disambiguation.

## COGS and financial history

Product Groups let related Products inherit an effective-dated base cost, including pack-quantity conversions. A direct Product cost remains an explicit override.

COGS precedence is:

1. Direct Product COGS
2. Product Group inherited COGS
3. Unknown

Financial history is effective-dated. Transactions use the cost that was effective on the transaction date; later cost changes do not rewrite historical evidence. Missing cost is never treated as zero.

Profitability coverage communicates how much of the selected revenue is supported by known COGS. “Known” profit and margin are calculated from the cost-complete cohort, and incomplete coverage remains visible throughout Dashboard, Products, Transactions, and Reports.

## Main application areas

- Marketplace Profitability Dashboard, attention and sync health
- Products, Product Detail, listings, costs, trends, transactions, and activity
- COGS workspace, governed imports, approvals, and Product Groups
- Canonical Transactions and transaction evidence
- Effective-dated Expenses and allocation
- Reports: Operational P&L, Product Profitability, Marketplace Profitability, Fees, Refunds, Expenses, and Transactions
- Copilot explanations grounded in the current authorised context

The Products table includes a permission-aware Current COGS shortcut. It opens the existing governed single-Product COGS flow; it does not bypass effective date, reason, review, approval, history, or RBAC rules.

## Administration surfaces

Tenant Administration covers Organisation, Companies, Marketplace Accounts, Users, Roles & Permissions, Billing & Modules, and Audit. Subscription state, module entitlement, and RBAC are separate concepts.

The intended tenant access model is:

**Default Role Templates + Custom Roles + Multiple Role Assignments + Company / Marketplace Account Scope = Effective User Access**

Default roles remain protected templates. Organisation-specific roles can be created or duplicated, edited, and deactivated. A user can hold multiple scoped assignments; effective permissions are the union of allowed capabilities, with no explicit-deny precedence in this prototype. The administration UI demonstrates the contract, while the Prototype Controller continues to switch among default roles for review.

My Account is deliberately separate from tenant membership administration. `/account/profile` covers personal identity and appearance, `/account/security` demonstrates password, 2FA, recovery-code, and session UX, and `/account/notifications` covers personal in-app/email preferences. The header notification centre demonstrates unread state and operational deep links. All are browser-only UX contracts requiring real identity, security, session, and delivery services in production.

Tenth Tech Platform Administration covers the Platform Dashboard, Organisations, Organisation Detail, Subscriptions, Modules, Sync Health, AI Usage, Platform Audit, and support preview of an Organisation workspace. Its visual identity and Platform Super Admin access remain distinct from tenant administration.

## Prototype Controller

Set `NEXT_PUBLIC_PROTOTYPE_MODE=true` at build time to show the global Prototype Controller. It provides:

- Journey/Page switching, including direct onboarding-stage jumps
- Role switching, including Platform Super Admin
- Scenario switching and scenario reset
- Organisation switching
- Light, Dark, and System appearance switching
- Full prototype reset

The mobile controller opens as a bottom drawer. “Reset scenario” restores Healthy Business. “Reset prototype” clears Stock Supplies mock browser state and returns to the canonical Organisation Dashboard.

Theme choices use local browser storage. Dark persists across navigation and refresh; System follows `prefers-color-scheme`. The public marketing website intentionally keeps its approved light direction.

## Authentication and persistence

Prototype sign-in example:

```text
developer@example.com
password123
```

Any other valid-looking email with a non-empty valid-looking password follows the same intentionally permissive prototype behaviour. Forgot Password sends nothing. Invitation tokens and marketplace/provider interactions are simulated.

Mock changes live in browser storage or in-memory repository singletons. They are device/browser specific, have no concurrency guarantees, may reset between builds, and must not be treated as durable records.

## Route map

Public and account entry:

- `/` and public content routes such as `/pricing`, `/contact`, and `/integrations/*`
- `/auth/sign-in`, `/auth/register`, `/auth/forgot-password`, `/auth/invite/demo`
- `/account/{profile,security,notifications}` for personal settings independent of any Organisation
- `/onboarding/*` for Account → Subscription → Payment → Organisation → Companies → Marketplace Accounts → Sync → COGS readiness → Users → Complete

Tenant workspace (`stock-supplies` is the canonical demo slug):

- `/o/stock-supplies/dashboard`
- `/o/stock-supplies/products` and `/products/[productId]`
- `/o/stock-supplies/cogs`, `/cogs/import/*`, and `/cogs/groups/*`
- `/o/stock-supplies/transactions` and `/transactions/[transactionId]`
- `/o/stock-supplies/expenses` and `/expenses/[expenseId]`
- `/o/stock-supplies/reports` and `/reports/{p-and-l,product-profitability,marketplace-profitability,fees,refunds,expenses,transactions}`
- `/o/stock-supplies/operations/{attention,sync-health}`
- `/o/stock-supplies/admin/{organisation,companies,marketplace-accounts,users,roles,billing,audit}`

Platform workspace:

- `/platform/dashboard`
- `/platform/organisations` and `/platform/organisations/[organisationId]`
- `/platform/{subscriptions,modules,integrations,ai-usage,audit}` (`/platform/integrations` is the Platform Sync Health surface)

## Final review evidence

The curated 12-image walkthrough and concise completion notes are in [`artifacts/phase-10-final/README.md`](../artifacts/phase-10-final/README.md). The production-browser interaction report is in [`artifacts/phase-10-final/smoke-results.json`](../artifacts/phase-10-final/smoke-results.json).

## Local development and deployment

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Final checks:

```bash
npm run check
npm run build
git diff --check
```

The Git remote is `tenthtechdev-stack/module1-prototype` on GitHub. Use the normal branch/pull-request review workflow, run the checks above, then merge through the repository’s agreed process. No GitHub Actions workflow is currently committed in this prototype.

`netlify.toml` enables `NEXT_PUBLIC_PROTOTYPE_MODE=true` for Netlify builds. The flag is public and build-time: changing it requires a rebuild/redeploy. Connect the approved GitHub branch in Netlify and use the standard Next.js build (`npm run build`); deployment credentials and site ownership stay outside this repository.

## Where production APIs replace mocks

Keep the domain types, repository interfaces, hooks, and query keys as the UI boundary. Replace the concrete repository construction in `src/services/runtime.ts` and the implementations under `src/services/mock/` with authenticated API-backed adapters. Onboarding contracts are in `src/services/onboarding-contracts.ts`; report, expense, transaction, and Product Group contracts have dedicated files under `src/services/`.

Production work must separately add real identity/session enforcement, tenant isolation on the server, durable storage, marketplace OAuth and sync jobs, Stripe, email delivery, audit retention, observability, secrets management, API validation, idempotency, reconciliation, security review, and deployment/runbook controls.

## Intentionally not production-ready

- Authentication, invitations, billing, email, marketplace connections, sync, and Copilot are simulated.
- Financial fixtures are illustrative and repository latency/errors are deliberate prototype states.
- Client-side role switching demonstrates UX; it is not a security boundary.
- Local/session storage is not a database or cross-device persistence mechanism.
- Export and contact behaviours are prototype-only.
- Accessibility has received a practical basics pass, not certification.

## Future considerations from competitor review

Possible future product research includes FIFO COGS, weighted-average COGS, inventory/batch-aware costing, scheduled COGS imports, external COGS sources such as spreadsheets or APIs, configurable analytics cards, and variable expenses. **None of these are implemented in the Module 01 prototype**, and they should not be inferred from the current costing or reporting architecture.
