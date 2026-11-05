# Olango Fiber Network — Payment Tracker

## Deployment status

This branch is a **restricted owner-only release candidate**, not yet the full live multi-user release.

The app now requires Firebase Authentication and its Firestore rules restrict the existing shared data document to the verified owner account `sagarinojoyrey@gmail.com`. All other Firestore paths are denied. Demo account switching has been removed.

**Collector/staff login is intentionally disabled.** The current application stores clients, invoices, payments, expenses, staff profiles, handovers, shifts, and audit entries together in one Firestore document (`prototypes/isp-tracker`). Giving collectors access to that document would let them potentially change data outside their job. Do not loosen the rules to make staff login work. A separate collection-based database and tested role-specific rules are required first.

## Before deployment — protect existing records

1. Keep the current live Firebase project and existing Firestore document intact.
2. Export/download a backup of `prototypes/isp-tracker` from Firebase Console before changing rules or deploying.
3. Confirm the backup can be opened and contains the expected client, invoice, payment, expense, handover, shift, and audit arrays.
4. Do not import real customer data into a test Firebase project, and do not delete the original document during any future migration.

## Firebase setup

The Firebase web configuration in `index.html` identifies the project; it is not an admin credential.

1. Open Firebase Console for project `final-tracker-743c3`.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Authentication → Users**, create the owner account `sagarinojoyrey@gmail.com` if it does not already exist. Set its password privately in Firebase Console; never put a password in this repository or send it in chat.
4. Verify the owner's email address. The Firestore rules require `email_verified == true`.
5. In **Authentication → Settings → Authorized domains**, ensure the GitHub Pages domain and any custom production domain are listed.
6. Confirm the Firestore database exists and that the existing document `prototypes/isp-tracker` is present and backed up.

## Deploy security rules before the website

Install/use Firebase CLI on a trusted computer, authenticate with an account that has Firebase project deployment permissions, then run from this repository:

```bash
firebase use final-tracker-743c3
firebase deploy --only firestore:rules
```

The rules are deny-by-default. Only the verified owner email can read or write `prototypes/isp-tracker`. All other documents and all other users are denied.

After deploying rules, test that:
- The verified owner can sign in and load the tracker.
- A signed-out browser cannot read the tracker.
- A different authenticated account cannot read or write the tracker.
- No collector account is given access to the shared document.

## Deploy the website

After Authentication and rules have been configured and tested:

```bash
firebase deploy --only hosting
```

The included `firebase.json` publishes the repository root. If using GitHub Pages instead, Firebase Hosting deployment is not required, but the deployed site domain must be in Firebase Authentication's authorized domains and HTTPS must be used.

## Current known limitations — do not treat as complete

- Owner-only access; no collector/staff login or role-based access yet.
- Data remains in one shared Firestore document. This is not safe for concurrent multi-user editing and has a document-size ceiling.
- No server-side billing, payment, reversal, or audit validation.
- No automated customer SMS/email reminders.
- No verified end-to-end browser tests against the real Firebase project.
- No automated scheduled backup/restore test.
- CSV import maps the legacy `DUE AMOUNT` field to opening balance; monthly plan and monthly fee still need to be confirmed for each imported client.
- Slash-formatted dates are ambiguous across locales. Prefer ISO `YYYY-MM-DD` or a numeric due-day column.

## Required work before enabling collectors

Migrate the shared document to separate Firestore collections (clients, invoices, payments, reversals, expenses, staff profiles, shifts, handovers, and audit events), with immutable/append-only financial records where appropriate. Add authenticated user profiles keyed by Firebase Auth UID, server-enforced role checks, atomic payment and reversal operations, and a dry-run migration that preserves the original document. Then add Firebase Emulator Suite tests for every security rule and business-critical workflow before enabling staff access.
