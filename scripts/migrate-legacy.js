#!/usr/bin/env node
"use strict";

/*
 * One-time, non-destructive migration from prototypes/isp-tracker.
 * Dry-run is the default. Apply only after exporting and reviewing the source.
 * Requires firebase-admin and Application Default Credentials for the existing
 * project. The original document is never changed or deleted.
 */
const admin = require("firebase-admin");

const PROJECT_ID = "final-tracker-743c3";
const SOURCE = ["prototypes", "isp-tracker"];
const COLLECTIONS = [
  "plans", "clients", "invoices", "payments", "reversals",
  "expenses", "handovers", "shifts", "audit"
];

function normalizeRows(source, key, aliases = []) {
  for (const name of [key, ...aliases]) {
    if (Array.isArray(source[name])) {
      return source[name].filter(
        row => row && typeof row === "object" && !Array.isArray(row)
      );
    }
  }
  return [];
}

function stableId(row, index, collection) {
  if (typeof row.id === "string" && row.id.trim()) return row.id;
  return `legacy-${collection}-${index + 1}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID
  });
  const firestore = admin.firestore();
  const legacyRef = firestore.collection(SOURCE[0]).doc(SOURCE[1]);
  const legacySnap = await legacyRef.get();
  if (!legacySnap.exists) throw new Error("Legacy source document was not found.");
  const source = legacySnap.data() || {};

  const migrationRef = firestore.collection("migrationMeta").doc("collection-v1");
  const priorMarker = await migrationRef.get();
  if (priorMarker.exists) {
    throw new Error("Migration marker already exists. Inspect the destination before retrying.");
  }

  const payloads = [];
  const counts = {};
  for (const collection of COLLECTIONS) {
    const rows = normalizeRows(source, collection, collection === "expenses"
      ? ["EXPENSES", "EXPENCES", "EXPENCE"] : []);
    counts[collection] = rows.length;
    rows.forEach((row, index) => {
      payloads.push({
        collection,
        id: stableId(row, index, collection),
        data: { ...row, id: stableId(row, index, collection) }
      });
    });
  }

  const users = normalizeRows(source, "users", ["USERS", "user", "USER"]);
  const invitations = users.filter(u => typeof u.email === "string" && u.email.includes("@"))
    .map(u => ({
      collection: "staffInvites",
      id: u.email.trim().toLowerCase(),
      data: {
        email: u.email.trim().toLowerCase(),
        role: u.role === "admin" ? "admin" : "collector",
        active: true,
        name: String(u.name || ""),
        mobile: String(u.mobile || "")
      }
    }));
  counts.staffInvites = invitations.length;
  payloads.push(...invitations);
  payloads.push({
    collection: "expenseSettings",
    id: "labels",
    data: { labels: Array.isArray(source.labels) ? source.labels : [] }
  });

  // Refuse to overwrite any pre-existing destination record. Identical records
  // are also rejected so an interrupted apply cannot be mistaken for a clean run.
  const conflicts = [];
  for (const item of payloads) {
    const existing = await firestore.collection(item.collection).doc(item.id).get();
    if (existing.exists) conflicts.push(`${item.collection}/${item.id}`);
  }
  if (conflicts.length) {
    throw new Error("Destination contains records; no writes made: " + conflicts.slice(0, 20).join(", "));
  }

  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY RUN",
    source: SOURCE.join("/"),
    counts,
    destinationRecords: payloads.length,
    sourcePreserved: true
  }, null, 2));
  if (!apply) {
    console.log("No data was written. Review the report and rerun with --apply only after backup approval.");
    return;
  }

  for (let offset = 0; offset < payloads.length; offset += 400) {
    const batch = firestore.batch();
    for (const item of payloads.slice(offset, offset + 400)) {
      batch.create(firestore.collection(item.collection).doc(item.id), item.data);
    }
    await batch.commit();
  }
  await migrationRef.create({
    source: SOURCE.join("/"),
    counts,
    destinationRecords: payloads.length,
    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    sourcePreserved: true
  });
  console.log("Migration writes completed. Verify counts and sample references before cutover.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
