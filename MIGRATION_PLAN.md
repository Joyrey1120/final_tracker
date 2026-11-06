# Authentication and role migration plan

## Current development branch

The development branch now has two data modes: it retains the original owner/admin-only single-document mode until a migration marker exists, and reads separate Firestore collections after migration. The role rules deny collectors access to the legacy document. In collection mode they allow the demo's collector reads and narrowly scoped payment, shift, handover, and audit writes. The source document remains intact.

- Existing owner: `sagarinojoyrey@gmail.com`
- Additional administrator: `dictomesagarino@gmail.com`

Both accounts currently receive the same broad access to that shared document. The application creates an admin profile for the second address on its first verified sign-in when no matching profile exists. Existing owner profile IDs and all existing document fields are retained. No collector is granted access by these transitional rules.

The app, role rules, UID enrollment path, and dry-run migration utility are present on the development branch. The new mode is not active until the rules are deployed and the migration script is run. This work has not been deployed to the existing Firebase project.

## Collector permission matrix from the supplied demo

Collectors may use these pages and actions:

- Dashboard: view the shared collection, expense, balance, and staff totals.
- Clients: search and view all clients, balances, and histories; no add, edit, import, deactivate, or delete controls.
- Payments: view payment records, print receipts, and record payments during an active shift; no reversal.
- Expenses: view the expense ledger; no add, label management, or deletion.
- Calendar: view dues, payments, balances, and forecasts.
- Cash: view their own shifts and handovers, start/end their shifts, and submit a cash handover; no viewing other collectors' cash or confirming handovers.
- Reminders: view due and overdue account amounts.
- No access to Plans, Staff, or Reports.

The demo computes some dashboard, client, calendar, and reminder values across all clients and records. The future data model must preserve only those read capabilities while preventing collectors from modifying admin data. It must not expose other collectors' payment attribution, shifts, or handovers through the Cash page.

Admin controls to retain include client deactivate/reactivate, guarded permanent client deletion, expense deletion with an audit event, and calendar navigation from January 2026 through December 2050.

## Production migration sequence (not performed)

1. In Firebase Console, export `prototypes/isp-tracker` and retain the original unchanged. Confirm arrays and record counts for users, plans, clients, invoices, payments, reversals, expenses, handovers, shifts, and audit.
2. Add the additional admin account in Firebase Authentication with a privately set password and verified email. Confirm its UID. Do not place passwords in the repository or chat.
3. Install the migration utility dependency from `scripts/` and run `node scripts/migrate-legacy.js` with Application Default Credentials for the existing project. Dry-run is the default; review counts, conflicts, and output first. The script handles legacy aliases, preserves stable IDs, adds UID-enrollment invitations, and never edits or deletes the source document.
4. With the app closed to all users, export the legacy document, then run `node scripts/migrate-legacy.js --apply`. The script writes collection records in resumable 400-document batches and writes the migration marker last. If source records changed during an interrupted run, resolve the reported conflicts manually before retrying.
5. Install the test dependencies from `tests/` and run `npm test` there. This starts the Firestore Emulator and runs role and permission tests. Require all tests to pass before deployment.
6. Deploy the rules before the website, then confirm the owner, additional admin, and a collector can perform only their allowed actions. Test direct Firestore requests as well as the UI.
7. Back up the migrated collections and document the rollback path before production cutover. Keep the original document unchanged until a separately approved retention decision.

## Planned role and data model

- `staff/{uid}`: email, role (`admin` or `collector`), active status, timestamps. Only an existing admin may create/change roles; users cannot edit their own role or status.
- Separate collections per business entity, with stable IDs and explicit ownership/association fields.
- Payment creation and cash handover submission must be constrained to the signed-in collector. Reversal, handover confirmation, client changes, expense writes/deletes, plan changes, staff management, imports, reports, and backup exports are admin-only.
- Use append-only reversal/audit records rather than rewriting financial history.
- Validate references, allowed fields, amount/date formats, and state transitions in rules or trusted server code. Client-side checks are not an authorization boundary.

## Emulator verification checklist

Before any production rules deployment, cover at least:

- Unauthenticated reads/writes denied everywhere.
- Verified owner and additional admin can read/write authorized admin data.
- Unverified admin denied.
- Collector reads only the demo-authorized data and cannot read another collector's private cash/shift/attribution records.
- Collector can create a valid payment only for an active shift and cannot alter or delete existing financial records.
- Collector cannot create expenses, reverse payments, confirm handovers, edit clients/plans/staff, import/export reports, or access admin-only collections.
- Role self-promotion, role changes by collectors, unknown fields, malformed amounts, duplicate IDs, and writes to legacy paths are denied.
- Admin-only client deactivation/deletion and expense deletion are auditable; deletion protections preserve the financial ledger.
- Calendar boundaries accept January 2026 and December 2050 and reject months outside that range.
- Dry-run migration is repeatable and preserves exact source counts and values.

The branch now includes Firestore Emulator test configuration and a rules test suite at `tests/firestore.rules.test.js`. JavaScript syntax checks passed, but the Emulator suite has not run because the test dependencies could not be downloaded in this environment. Do not describe the rules or migration as emulator-tested until `npm test` completes successfully. No live Firebase project was accessed.

## Firebase Console actions needed for the interim admin sign-in

1. Select existing project `final-tracker-743c3`; do not create another Firebase project.
2. In Authentication, enable Email/Password if it is not already enabled. Create `dictomesagarino@gmail.com` or confirm its existing account, set/reset its password privately, and verify the email.
3. In Firestore, preserve and back up `prototypes/isp-tracker`.
4. Review this branch's `firestore.rules`. Deploying those rules is a separate production action and is intentionally not performed here. They temporarily permit the existing owner and this additional admin to the full shared document; collectors remain denied.
5. Add the hosted site domain to Firebase Authentication's authorized domains if needed.

The interim rule change is not a collector migration and must not be used to enable collector logins.
