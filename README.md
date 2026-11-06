# Olango Fiber Network — Payment Tracker

## Status

This is an unmerged development release. It includes the current admin controls, a collection-based Firestore data layer, Firebase UID enrollment for approved staff, role-specific rules, a dry-run legacy-data migrator, and local Firestore rules tests.

The existing live document `prototypes/isp-tracker` remains the source of truth until the migration marker is written. The development app keeps the original admin-only mode before migration and uses separate records after migration. The original document is preserved by the migrator.

- Existing owner: `sagarinojoyrey@gmail.com`
- Additional admin approved for this release: `dictomesagarino@gmail.com`

The additional admin must first have a verified Email/Password account in Firebase Authentication. A Firebase Console password must be set or reset privately; passwords must never be committed or shared in chat.

**This branch is not deployed.** Do not merge or deploy it until the emulator suite passes and the migration has been backed up, reviewed, and approved.

## Collector access from the supplied demo

Collectors can view Dashboard, Clients, Payments, Expenses, Calendar, Cash, and Reminders. They can search and view client records and histories, record payments during their active shift, start/end their shifts, and submit their own cash handovers. They cannot change clients or plans, add/delete expenses, reverse payments, confirm handovers, manage staff, or export admin reports. Cash and shift records are scoped to the signed-in collector, including their preserved legacy IDs.

Firestore rules protect these paths; hiding a button is not the authorization check. The shared legacy document remains inaccessible to collectors.

## Protect and migrate existing records

1. In the existing project `final-tracker-743c3`, export `prototypes/isp-tracker` and verify its record arrays and counts. Keep this source document intact.
2. Stop tracker use while migration is running so no one writes to the source during the copy.
3. Install the isolated migration dependency and run a dry run. From the repository root:

   ```powershell
   npm --prefix scripts install
   node scripts/migrate-legacy.js
   ```

   The dry run reports the source and destination counts. It handles legacy array aliases, preserves record IDs, creates staff invitations, refuses conflicting destination records, and does not write.
4. After a reviewed backup and approved cutover, run `node scripts/migrate-legacy.js --apply`. The script writes in resumable batches, writes the migration marker last, and never edits or deletes the original document. It requires Application Default Credentials with permission to write Firestore in the existing project.
5. In `tests/`, install dependencies and run the Firestore Emulator suite:

   ```powershell
   npm install
   npm test
   ```

   All rules tests must pass before production deployment.
6. Deploy the reviewed rules first, then the website. Confirm owner, additional admin, and at least one collector login and exercise the forbidden direct requests listed in the tests.

## Firebase Console actions

These actions have not been performed:

1. Select existing project `final-tracker-743c3`; do not create a Firebase project.
2. Enable Email/Password sign-in if needed.
3. Confirm the owner account remains active and verified.
4. Create or confirm `dictomesagarino@gmail.com`, set/reset its password privately, and verify its email.
5. Add the hosted domain under Authentication → Settings → Authorized domains.
6. Export and inspect the original Firestore document before migration.

The Firestore rules on this branch temporarily preserve owner access to the legacy document and grant the additional admin access only while its UID profile is active and has the admin role. Collectors are denied access to that document. Collection rules support approved UID-bound invitations after the migration marker exists.

## Verification status and limitations

- JavaScript syntax checks passed for the application inline scripts, migration script, and emulator test file.
- The Firestore Emulator rules suite passed in GitHub Actions at the current development revision, including role access, collector payment/shift/handover restrictions, migration-legacy shift closure, and field validation.
- Automated migration tests pass for dry-run behavior and a simulated interruption after 400 records; retry skips exact matching rows and writes the marker last. The migration script has not been run against production data.
- Firebase Console inspection confirmed Email/Password is enabled and both administrator Authentication accounts exist. Hosting is not initialized. No production data migration, rules deployment, Hosting deployment, or account-password sign-in test has been performed.
- The current rules allow collectors to submit a handover for any positive amount; the app checks the available cash and an admin must confirm receipt. Strong server-side reconciliation of cash totals is still needed before treating handover totals as tamper-proof.
- There is no server-side billing engine, automated SMS/email reminder service, or scheduled backup/restore test.
- CSV import maps legacy `DUE AMOUNT` to opening balance. Confirm monthly plan and fees after import. Prefer ISO dates over ambiguous slash-formatted dates.
